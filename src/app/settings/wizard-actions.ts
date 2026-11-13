"use server";

import { count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { competitor, item, run, snapshot, source } from "@/db/schema";
import { createCompetitor, normalizeDomain } from "@/lib/competitors";
import { discoverSources, findPosts, titleFromUrl, type Proposed, type SourceRole } from "@/pipeline/discover";
import { collectSource } from "@/pipeline/collect";
import { assessPending } from "@/pipeline/assess";
import { saveLogo } from "@/pipeline/logo";
import { fetchSource } from "@/pipeline/fetch";
import { extractMain } from "@/pipeline/extract";
import type { PricingSnapshot } from "@/pipeline/pricing";

export type FindResult =
  | { ok: true; name: string; domain: string; sources: Proposed[]; notes: string[]; restoring: boolean }
  | { ok: false; error: string };

/** Step 1 → 2: find the pages worth watching. Writes nothing. */
export async function findPagesAction(nameRaw: string, domainRaw: string): Promise<FindResult> {
  const name = nameRaw.trim();
  const domain = normalizeDomain(domainRaw);
  if (!name) return { ok: false, error: "Give the company a name, the way your team says it." };
  if (!domain) return { ok: false, error: "Enter their website, like example.com." };
  const [existing] = await db().select().from(competitor).where(eq(competitor.domain, domain));
  if (existing && !existing.archivedAt) return { ok: false, error: `${existing.name} is already watched.` };
  try {
    const found = await discoverSources(domain);
    if (!found.homeUrl) return { ok: false, error: found.notes[0] ?? `Could not open ${domain}.` };
    return { ok: true, name, domain, sources: found.sources, notes: found.notes, restoring: !!existing };
  } catch (e) {
    console.error("discovery failed", e);
    return { ok: false, error: `Something went wrong reading ${domain}. Try again in a minute.` };
  }
}

/** Step 2: the owner pastes a page we didn't find. Checks it opens; for blog/news, finds its posts. */
export async function checkPageAction(urlRaw: string, role: SourceRole): Promise<{ ok: true; source: Proposed } | { ok: false; error: string }> {
  const url = urlRaw.trim().startsWith("http") ? urlRaw.trim() : `https://${urlRaw.trim()}`;
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "That isn't a web address." };
  }
  try {
    const r = await fetchSource(url, "http");
    if (!r.ok) return { ok: false, error: `We couldn't open it (${r.error ?? r.status}).` };
    const path = new URL(r.url).pathname.replace(/\/$/, "");
    const label = path.split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Page";
    if (role === "posts") {
      const posts = findPosts(r.body, r.url);
      if (!posts) return { ok: false, error: "We opened it but found no list of articles. Add it as a product page instead." };
      return { ok: true, source: { kind: "listing", url: r.url, label, role, pageType: "general", linkPrefix: posts.prefix, sample: posts.links.slice(0, 3).map((l) => l.title ?? titleFromUrl(l.url)), checked: true } };
    }
    if (extractMain(r.body, r.url, "page").text.length < 100) return { ok: false, error: "The page opened but has almost no text. It may need a browser to load." };
    return { ok: true, source: { kind: "page", url: r.url, label: role === "pricing" ? "Pricing" : label, role, pageType: role === "pricing" ? "pricing" : "general", sample: [], checked: true } };
  } catch (e) {
    return { ok: false, error: (e as Error).message.includes("private") ? "Only public web pages can be watched." : "We couldn't open it." };
  }
}

export type CreatedSource = { id: number; label: string; role: SourceRole };
export type CreateResultUI =
  | { ok: true; competitorId: number; runId: number; restored: boolean; sources: CreatedSource[] }
  | { ok: false; error: string };

/** Step 2 → 3: save the competitor and the chosen pages. */
export async function createFromWizardAction(name: string, domain: string, chosen: Proposed[]): Promise<CreateResultUI> {
  if (!chosen.length) return { ok: false, error: "Pick at least one page to watch." };
  const d = db();
  const res = await createCompetitor(d, { name, domain, sources: chosen, addedBy: "wizard" });
  if (!res.ok) return res;
  const rows = res.sourceIds.length ? await d.select().from(source).where(eq(source.competitorId, res.competitor.id)) : [];
  const sources = rows
    .filter((r) => res.sourceIds.includes(r.id))
    .map((r) => ({ id: r.id, label: r.label, role: chosen.find((c) => c.url === r.url)?.role ?? (r.pageType === "pricing" ? "pricing" : r.kind === "page" ? "product" : "posts") }));
  // The logo is found and kept in the background; the page shows the site icon until it is in.
  void saveLogo(d, res.competitor.id, res.competitor.domain);
  // A finished run row to hang the first checks on. It is never "running", so it can't block the scheduled run.
  const [r] = await d.insert(run).values({ status: "ok", trigger: "first-check", finishedAt: new Date() }).returning({ id: run.id });
  revalidatePath("/", "layout");
  return { ok: true, competitorId: res.competitor.id, runId: r!.id, restored: res.restored, sources };
}

/** Step 3: read one page now, so the next check has something to compare against. */
export async function firstCheckAction(sourceId: number, runId: number): Promise<{ ok: boolean; text: string }> {
  const d = db();
  const [row] = await d.select({ s: source, c: competitor }).from(source).innerJoin(competitor, eq(source.competitorId, competitor.id)).where(eq(source.id, sourceId));
  if (!row) return { ok: false, text: "Not found" };
  const res = await collectSource(d, runId, row.s, row.c);
  if (!res.ok) return { ok: false, text: plainError(res.error ?? "") };
  if (row.s.kind !== "page") {
    const [{ n } = { n: 0 }] = await d.select({ n: count() }).from(item).where(eq(item.sourceId, sourceId));
    return { ok: true, text: n ? `${n} past post${n === 1 ? "" : "s"} recorded` : "Ready" };
  }
  if (row.s.pageType === "pricing") {
    const [snap] = await d.select().from(snapshot).where(eq(snapshot.sourceId, sourceId)).orderBy(desc(snapshot.fetchedAt)).limit(1);
    const plans = (snap?.structured as PricingSnapshot | null)?.plans?.length ?? 0;
    return { ok: true, text: plans ? `${plans} plan${plans === 1 ? "" : "s"} read` : "Pricing saved" };
  }
  return { ok: true, text: "Snapshot saved" };
}

/**
 * After the first check: judge the latest posts now, in the background, so they show up in Changes within
 * a few minutes instead of after the next scheduled run.
 */
export async function finishWizardAction(runId: number) {
  void assessPending(db(), runId).catch((e) => console.error("first-check judging failed", e));
  revalidatePath("/", "layout");
}

function plainError(e: string) {
  if (/blocked|bot wall|403/.test(e)) return "The site blocked us";
  if (/404/.test(e)) return "Page not found";
  if (/no posts found/.test(e)) return "No posts found";
  if (/too short|no plans/.test(e)) return "Page looks empty";
  return "Couldn't read it";
}
