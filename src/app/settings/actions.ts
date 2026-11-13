"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, person, source, team, topic, type NoiseLevel, type PageType, type PersonRole } from "@/db/schema";
import { discoverSources } from "@/pipeline/discover";
import { OWNER_TEXTS, restoreOwnerText, setOwnerText, type OwnerTextKey } from "@/lib/owner-text";
import { applySuggestion, dismissSuggestion } from "@/pipeline/own-site";
import { addToExam } from "@/eval/owner-golden";
import type { Level } from "@/db/schema";
import { currentViewer } from "@/lib/viewer";
import { canEditTeam, canManagePeople } from "@/lib/view-as";
import { ownerTextPath } from "@/lib/nav";
import { tryLens, type LensTrial } from "@/pipeline/preview";

export async function addCompetitor(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) redirect("/settings/competitors?error=" + encodeURIComponent("Enter a name and a website like example.com"));
  const d = db();
  const [existing] = await d.select().from(competitor).where(eq(competitor.domain, domain));
  if (existing) redirect("/settings/competitors?error=" + encodeURIComponent(`${existing.name} is already watched`));

  const found = await discoverSources(domain);
  const [c] = await d.insert(competitor).values({ name, domain }).returning();
  for (const s of found.sources) {
    await d.insert(source).values({ competitorId: c!.id, kind: s.kind, url: s.url, label: s.label, linkPrefix: s.linkPrefix }).onConflictDoNothing();
  }
  const summary = found.sources
    .map((s) => `${s.label}${s.sample.length ? ` (latest: ${s.sample.slice(0, 3).join("; ")})` : ""}`)
    .join(" · ");
  const msg = `${name} added. Watching: ${summary || "nothing yet"}. ${found.notes.join(" ")} The first check runs within 3 hours; what's already published is recorded as history, and only new posts and changes are reported.`;
  revalidatePath("/settings", "layout");
  redirect("/settings/competitors?added=" + encodeURIComponent(msg));
}

/** The owner adds one page to watch, and picks which skill reads it. */
export async function addWatchedPage(form: FormData) {
  const competitorId = Number(form.get("competitorId"));
  const url = String(form.get("url") ?? "").trim();
  const pageType = (form.get("pageType") === "pricing" ? "pricing" : "general") as PageType;
  const label = String(form.get("label") ?? "").trim() || (pageType === "pricing" ? "Pricing" : "Page");
  const [c] = await db().select().from(competitor).where(eq(competitor.id, competitorId));
  if (!c || !/^https?:\/\//.test(url)) redirect("/settings/competitors?error=" + encodeURIComponent("Pick a competitor and paste the full page address, starting with https://"));
  await db().insert(source).values({ competitorId, kind: "page", url, label, pageType }).onConflictDoNothing();
  revalidatePath("/settings", "layout");
  redirect("/settings/competitors?added=" + encodeURIComponent(`Watching ${c.name} · ${label} as a ${pageType === "pricing" ? "pricing page (plans, prices and features compared one by one)" : "general page"}. The first check records it as it is today.`));
}

export async function setCompetitorActive(form: FormData) {
  await db().update(competitor).set({ active: form.get("active") === "1" }).where(eq(competitor.id, Number(form.get("id"))));
  revalidatePath("/settings", "layout");
}

export async function addTopic(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const teamKeys = form.getAll("teams").map(String);
  if (!name || teamKeys.length === 0) redirect("/settings/topics?error=" + encodeURIComponent("A topic needs a name and at least one team"));
  await db().insert(topic).values({ name, description: description || name, teamKeys });
  revalidatePath("/settings", "layout");
  redirect("/settings/topics?added=" + encodeURIComponent(`Topic "${name}" added. It is used from the next check onward.`));
}

export async function updateTopic(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const teamKeys = form.getAll("teams").map(String);
  if (!name || teamKeys.length === 0) redirect("/settings/topics?error=" + encodeURIComponent("A topic needs a name and at least one team"));
  await db().update(topic).set({ name, description: description || name, teamKeys }).where(eq(topic.id, Number(form.get("id"))));
  revalidatePath("/settings", "layout");
  redirect("/settings/topics?added=" + encodeURIComponent(`Topic "${name}" saved. It is used from the next check onward.`));
}

/** What Noma sells, the level definitions, page-type guidance: owner text used in every judgment. */
export async function saveOwnerText(form: FormData) {
  const key = String(form.get("key")) as OwnerTextKey;
  const value = String(form.get("text") ?? "").trim();
  if (!(key in OWNER_TEXTS)) redirect(ownerTextPath(key) + "?error=" + encodeURIComponent("Unknown setting"));
  if (value.length < 40) redirect(ownerTextPath(key) + "?error=" + encodeURIComponent("Write at least a sentence or two"));
  if (key === "levels" && !["alert:", "digest:", "log:", "none:"].every((l) => value.includes(l))) {
    redirect(ownerTextPath(key) + "?error=" + encodeURIComponent("Keep one line for each level: alert:, digest:, log: and none:"));
  }
  await setOwnerText(db(), key, value);
  revalidatePath("/settings", "layout");
  redirect(ownerTextPath(key) + "?added=" + encodeURIComponent(`${OWNER_TEXTS[key].title} saved. Changes apply from the next check.`));
}

export async function removeTopic(form: FormData) {
  await db().update(topic).set({ active: false }).where(eq(topic.id, Number(form.get("id"))));
  revalidatePath("/settings", "layout");
}

export async function updateTeam(form: FormData) {
  const lens = String(form.get("lens") ?? "").trim();
  const noise = (form.get("noise") === "quiet" ? "quiet" : "normal") as NoiseLevel;
  // The preview page saves the description only; the team page also sets how often the team hears from us.
  const back = String(form.get("back") ?? "").startsWith("/settings/") ? String(form.get("back")) : "/settings/teams";
  const sep = back.includes("?") ? "&" : "?";
  const key = String(form.get("key"));
  if (!canEditTeam(await currentViewer(), key)) redirect(back + sep + "error=" + encodeURIComponent("Only that team's owner (or the builder) can change its description"));
  if (lens.length < 40) redirect(back + sep + "error=" + encodeURIComponent("Describe what the team cares about in at least a sentence or two"));
  await db().update(team).set(form.has("noise") ? { lens, noise } : { lens }).where(eq(team.key, key));
  revalidatePath("/settings", "layout");
  redirect(back + sep + "added=" + encodeURIComponent("Saved. Changes apply from the next check."));
}

/** The owner approves a suggestion from Noma's site, after editing the profile text and ticking the topic changes they want. */
export async function approveSuggestion(form: FormData) {
  const ok = await applySuggestion(db(), Number(form.get("id")), {
    company: form.get("useCompany") === "1" ? String(form.get("company") ?? "") : null,
    topicNames: form.getAll("topics").map(String),
  });
  revalidatePath("/settings", "layout");
  redirect("/settings/suggestions?" + (ok ? "added=" + encodeURIComponent("Approved. The updates apply from the next check, and the earlier version is kept under Earlier versions.") : "error=" + encodeURIComponent("That suggestion was already handled")));
}

export async function dismissSuggestionAction(form: FormData) {
  await dismissSuggestion(db(), Number(form.get("id")));
  revalidatePath("/settings", "layout");
  redirect("/settings/suggestions?added=" + encodeURIComponent("Dismissed. Nothing was changed."));
}

export async function restoreOwnerTextAction(form: FormData) {
  const k = await restoreOwnerText(db(), Number(form.get("id")));
  revalidatePath("/settings", "layout");
  redirect(ownerTextPath(k) + "?" + (k ? "added=" + encodeURIComponent(`${OWNER_TEXTS[k].title}: earlier version restored. The version it replaced is kept too.`) : "error=" + encodeURIComponent("That version no longer exists")));
}

const LEVELS = ["alert", "digest", "log", "none"] as const;

/** The owner turns an item a team marked not useful into an exam item, with the right level for each team. */
export async function addToExamAction(form: FormData) {
  const itemId = Number(form.get("itemId"));
  const expected: Record<string, Level> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("level:") && (LEVELS as readonly string[]).includes(String(v))) expected[k.slice(6)] = v as Level;
  }
  const g = await addToExam(db(), itemId, expected, String(form.get("note") ?? ""));
  revalidatePath("/settings", "layout");
  redirect("/settings/review?" + (g
    ? "added=" + encodeURIComponent(`Saved to the exam. From the next exam on, the judge is checked against your answer for "${g.title ?? g.url}".`)
    : "error=" + encodeURIComponent("That item could not be added")) + "#review");
}

/** An owner adds an owner or a member to their own team; the builder adds to any team. */
export async function addPerson(form: FormData) {
  const viewer = await currentViewer();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const title = String(form.get("title") ?? "").trim() || "Team member";
  const role = (form.get("role") === "owner" ? "owner" : "member") as PersonRole;
  const teamKey = String(form.get("team") ?? "");
  const back = (q: string) => redirect("/settings/people?" + q);
  if (!canManagePeople(viewer, teamKey)) back("error=" + encodeURIComponent("You can add people only to your own team"));
  if (name.length < 2 || name.length > 60) back("error=" + encodeURIComponent("Enter the person's name"));
  const [t] = await db().select().from(team).where(eq(team.key, teamKey));
  if (!t) back("error=" + encodeURIComponent("Pick a team"));
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
  const taken = new Set((await db().select({ key: person.key }).from(person)).map((p) => p.key));
  let key = slug;
  for (let n = 2; taken.has(key) || key === "builder"; n++) key = `${slug}-${n}`;
  await db().insert(person).values({ key, name, title, role, teamKey, addedBy: viewer.key });
  revalidatePath("/", "layout");
  back("added=" + encodeURIComponent(`${name} is now ${role === "owner" ? "an owner" : "a member"} of ${t!.name}. You can view the app as ${name} from your menu.`));
}

/** Removes someone from a team. Nobody removes themselves, so a team always keeps the owner who is doing this. */
export async function removePerson(form: FormData) {
  const viewer = await currentViewer();
  const [p] = await db().select().from(person).where(and(eq(person.key, String(form.get("key") ?? "")), isNull(person.removedAt)));
  if (!p || !canManagePeople(viewer, p.teamKey)) redirect("/settings/people?error=" + encodeURIComponent("You can remove people only from your own team"));
  if (p!.key === viewer.key) redirect("/settings/people?error=" + encodeURIComponent("You can't remove yourself. Ask another owner of your team, or the Builder."));
  await db().update(person).set({ removedAt: new Date() }).where(eq(person.id, p!.id));
  revalidatePath("/", "layout");
  redirect("/settings/people?added=" + encodeURIComponent(`${p!.name} was removed.`));
}

/** Tries a draft team description on the team's latest changes. Saves nothing. */
export async function tryLensAction(_prev: { trials?: LensTrial[]; lens?: string; error?: string }, form: FormData) {
  const key = String(form.get("key"));
  const lens = String(form.get("lens") ?? "").trim();
  if (!canEditTeam(await currentViewer(), key)) return { lens, error: "Only that team's owner (or the builder) can try changes to it" };
  if (lens.length < 40) return { lens, error: "Describe what the team cares about in at least a sentence or two" };
  try {
    const trials = await tryLens(db(), key, lens);
    return trials.length ? { lens, trials } : { lens, error: "There are no changes from the last 30 days to try it on yet" };
  } catch (e) {
    console.error("tryLens failed", e);
    return { lens, error: "Could not run the trial. Try again in a minute." };
  }
}
