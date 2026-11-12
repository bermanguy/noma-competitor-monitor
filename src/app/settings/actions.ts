"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, source, team, topic, type NoiseLevel, type PageType } from "@/db/schema";
import { discoverSources } from "@/pipeline/discover";
import { OWNER_TEXTS, setOwnerText, type OwnerTextKey } from "@/lib/owner-text";

export async function addCompetitor(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) redirect("/settings?error=" + encodeURIComponent("Enter a name and a website like example.com"));
  const d = db();
  const [existing] = await d.select().from(competitor).where(eq(competitor.domain, domain));
  if (existing) redirect("/settings?error=" + encodeURIComponent(`${existing.name} is already watched`));

  const found = await discoverSources(domain);
  const [c] = await d.insert(competitor).values({ name, domain }).returning();
  for (const s of found.sources) {
    await d.insert(source).values({ competitorId: c!.id, kind: s.kind, url: s.url, label: s.label, linkPrefix: s.linkPrefix }).onConflictDoNothing();
  }
  const summary = found.sources
    .map((s) => `${s.label}${s.sample.length ? ` (latest: ${s.sample.slice(0, 3).join("; ")})` : ""}`)
    .join(" · ");
  const msg = `${name} added. Watching: ${summary || "nothing yet"}. ${found.notes.join(" ")} The first check runs within 3 hours; what's already published is recorded as history, and only new posts and changes are reported.`;
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(msg));
}

/** The owner adds one page to watch, and picks which skill reads it. */
export async function addWatchedPage(form: FormData) {
  const competitorId = Number(form.get("competitorId"));
  const url = String(form.get("url") ?? "").trim();
  const pageType = (form.get("pageType") === "pricing" ? "pricing" : "general") as PageType;
  const label = String(form.get("label") ?? "").trim() || (pageType === "pricing" ? "Pricing" : "Page");
  const [c] = await db().select().from(competitor).where(eq(competitor.id, competitorId));
  if (!c || !/^https?:\/\//.test(url)) redirect("/settings?error=" + encodeURIComponent("Pick a competitor and paste the full page address, starting with https://"));
  await db().insert(source).values({ competitorId, kind: "page", url, label, pageType }).onConflictDoNothing();
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(`Watching ${c.name} · ${label} as a ${pageType === "pricing" ? "pricing page (plans, prices and features compared one by one)" : "general page"}. The first check records it as it is today.`));
}

export async function setCompetitorActive(form: FormData) {
  await db().update(competitor).set({ active: form.get("active") === "1" }).where(eq(competitor.id, Number(form.get("id"))));
  revalidatePath("/settings");
}

export async function addTopic(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const teamKeys = form.getAll("teams").map(String);
  if (!name || teamKeys.length === 0) redirect("/settings?error=" + encodeURIComponent("A topic needs a name and at least one team"));
  await db().insert(topic).values({ name, description: description || name, teamKeys });
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(`Topic "${name}" added. It is used from the next check onward.`));
}

export async function updateTopic(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const teamKeys = form.getAll("teams").map(String);
  if (!name || teamKeys.length === 0) redirect("/settings?error=" + encodeURIComponent("A topic needs a name and at least one team"));
  await db().update(topic).set({ name, description: description || name, teamKeys }).where(eq(topic.id, Number(form.get("id"))));
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(`Topic "${name}" saved. It is used from the next check onward.`));
}

/** What Noma sells, the level definitions, page-type guidance: owner text used in every judgment. */
export async function saveOwnerText(form: FormData) {
  const key = String(form.get("key")) as OwnerTextKey;
  const value = String(form.get("text") ?? "").trim();
  if (!(key in OWNER_TEXTS)) redirect("/settings?error=" + encodeURIComponent("Unknown setting"));
  if (value.length < 40) redirect("/settings?error=" + encodeURIComponent("Write at least a sentence or two"));
  if (key === "levels" && !["alert:", "digest:", "log:", "none:"].every((l) => value.includes(l))) {
    redirect("/settings?error=" + encodeURIComponent("Keep one line for each level: alert:, digest:, log: and none:"));
  }
  await setOwnerText(db(), key, value);
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(`${OWNER_TEXTS[key].title} saved. Changes apply from the next check.`));
}

export async function removeTopic(form: FormData) {
  await db().update(topic).set({ active: false }).where(eq(topic.id, Number(form.get("id"))));
  revalidatePath("/settings");
}

export async function updateTeam(form: FormData) {
  const lens = String(form.get("lens") ?? "").trim();
  const noise = (form.get("noise") === "quiet" ? "quiet" : "normal") as NoiseLevel;
  if (lens.length < 40) redirect("/settings?error=" + encodeURIComponent("Describe what the team cares about in at least a sentence or two"));
  await db().update(team).set({ lens, noise }).where(eq(team.key, String(form.get("key"))));
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent("Saved. Changes apply from the next check."));
}
