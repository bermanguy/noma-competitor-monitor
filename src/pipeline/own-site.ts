import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import type { DB } from "../db/client";
import { feedback, judgment, ownerSuggestion, setting, team, topic, type ProposedTopic } from "../db/schema";
import { getOwnerTexts, setOwnerText } from "../lib/owner-text";
import { SUGGEST_SYSTEM } from "../prompts/scaffold";
import { localNow, sendOnce } from "./deliver";
import { extractMain } from "./extract";
import { fetchSource } from "./fetch";
import { structuredCall } from "./llm";
import { diffText, formatDiff, hash, normalizeText } from "./text";

/**
 * Keeps the owner's text current. Noma's own pages are checked every run; when one really changes,
 * a model drafts an updated company profile and topic changes, and the owner approves or dismisses
 * them in Settings. Nothing the model drafts is used until the owner approves it.
 */

export const SuggestionDraft = z.object({
  relevant: z.boolean().describe("True only if the change alters what Noma sells, names or emphasises"),
  whatChanged: z.string().describe("One or two plain sentences quoting the changed words"),
  company: z.string().nullable().describe("The full updated company profile, or null if it still matches"),
  newTopics: z.array(z.object({ name: z.string(), description: z.string(), teamKeys: z.array(z.string()) })),
  changedTopics: z.array(z.object({ name: z.string().describe("Exact existing topic name"), description: z.string(), teamKeys: z.array(z.string()) })),
});

const seenKey = (url: string) => `own-site:${url}`;

export async function draftSuggestion(db: DB, runId: number | undefined, args: {
  url: string; diff: string; page: string; company: string; topics: ProposedTopic[]; teams: { key: string; name: string }[];
}) {
  const user = [
    `<company>\n${args.company}\n</company>`,
    `<topics>\n${args.topics.map((t) => `- ${t.name}: ${t.description} (teams: ${t.teamKeys.join(", ")})`).join("\n")}\n</topics>`,
    `<teams>\n${args.teams.map((t) => `${t.key} (${t.name})`).join("\n")}\n</teams>`,
    `Page: ${args.url}`,
    `<change>\n${args.diff}\n</change>`,
    `<page>\n${args.page.slice(0, 30000)}\n</page>`,
  ].join("\n\n");
  return structuredCall({ db, runId, purpose: "suggest", model: config.suggestModel, system: SUGGEST_SYSTEM, user, schema: SuggestionDraft, maxTokens: 4000 });
}

/** Checks Noma's own pages. Never throws: a failure here must not stop competitor monitoring. */
export async function checkOwnSite(db: DB, runId?: number): Promise<{ suggestions: number; errors: string[] }> {
  let suggestions = 0;
  const errors: string[] = [];
  for (const url of config.ownSitePages) {
    try {
      if (await checkPage(db, runId, url)) suggestions++;
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  return { suggestions, errors };
}

async function checkPage(db: DB, runId: number | undefined, url: string): Promise<boolean> {
  const res = await fetchSource(url, "http");
  if (!res.ok) throw new Error(res.error ?? `http ${res.status}`);
  const text = normalizeText(extractMain(res.body, url, "page").text);
  if (text.length < 200) throw new Error("page text too short; the page may have changed layout");

  const [seen] = await db.select().from(setting).where(eq(setting.key, seenKey(url)));
  const remember = () => db.insert(setting).values({ key: seenKey(url), value: text }).onConflictDoUpdate({ target: setting.key, set: { value: text, updatedAt: new Date() } });
  if (!seen) { await remember(); return false; } // first check: today's page is the baseline
  if (hash(seen.value) === hash(text)) return false;

  // While a suggestion for this page waits, measure from the text it started from, so the new draft covers every change.
  const [pending] = await db.select().from(ownerSuggestion)
    .where(and(eq(ownerSuggestion.pageUrl, url), eq(ownerSuggestion.status, "pending"))).orderBy(desc(ownerSuggestion.id)).limit(1);
  const base = pending?.baseText ?? seen.value;
  await remember();
  const d = diffText(base, text);
  if (d.size < config.minChangeChars) return false;

  const owner = await getOwnerTexts(db);
  const topics = (await db.select().from(topic).where(eq(topic.active, true))).map((t) => ({ name: t.name, description: t.description, teamKeys: t.teamKeys }));
  const teams = await db.select({ key: team.key, name: team.name }).from(team);
  const draft = await draftSuggestion(db, runId, { url, diff: formatDiff(d), page: text, company: owner.company, topics, teams });

  const teamKeys = new Set(teams.map((t) => t.key));
  const existing = new Set(topics.map((t) => t.name));
  const clean = (t: ProposedTopic) => ({ ...t, teamKeys: t.teamKeys.filter((k) => teamKeys.has(k)) });
  const newTopics = draft.newTopics.map(clean).filter((t) => t.teamKeys.length && !existing.has(t.name));
  const changedTopics = draft.changedTopics.map(clean).filter((t) => t.teamKeys.length && existing.has(t.name));
  const company = draft.company?.trim() && draft.company.trim() !== owner.company.trim() ? draft.company.trim() : null;
  if (!draft.relevant || (!company && !newTopics.length && !changedTopics.length)) return false;

  if (pending) await db.update(ownerSuggestion).set({ status: "superseded", decidedAt: new Date() }).where(eq(ownerSuggestion.id, pending.id));
  const [row] = await db.insert(ownerSuggestion).values({
    pageUrl: url, whatChanged: draft.whatChanged, baseText: base, newText: text, company, newTopics, changedTopics,
  }).returning();
  await notifyOwner(db, `owner:suggestion:${row!.id}`, {
    text: "Noma's site changed: suggested updates are waiting for your approval",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:memo: *Noma's site changed. Suggested updates are waiting for your approval.*\n${draft.whatChanged}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${[company && "Company profile", newTopics.length && `${newTopics.length} new topic(s)`, changedTopics.length && `${changedTopics.length} changed topic(s)`].filter(Boolean).join(" · ")} · <${config.publicUrl}/settings#suggestions|Review and approve>` }] },
    ],
  });
  return true;
}

/** Owner notes are optional: without an owner webhook they only show in Settings. */
export async function notifyOwner(db: DB, key: string, payload: unknown) {
  if (!process.env[config.ownerWebhookEnv]) return "skipped" as const;
  return sendOnce(db, key, { kind: "owner", teamKey: null, judgmentIds: [] }, config.ownerWebhookEnv, payload);
}

/** Applies an approved suggestion: the (possibly edited) company text and the topic changes the owner ticked. */
export async function applySuggestion(db: DB, id: number, choice: { company: string | null; topicNames: string[] }) {
  const [s] = await db.select().from(ownerSuggestion).where(eq(ownerSuggestion.id, id));
  if (!s || s.status !== "pending") return false;
  if (choice.company && choice.company.trim().length >= 40) await setOwnerText(db, "company", choice.company.trim(), "suggestion");
  const picked = new Set(choice.topicNames);
  for (const t of s.newTopics.filter((x) => picked.has(x.name))) await db.insert(topic).values(t);
  for (const t of s.changedTopics.filter((x) => picked.has(x.name))) {
    await db.update(topic).set({ description: t.description, teamKeys: t.teamKeys }).where(eq(topic.name, t.name));
  }
  await db.update(ownerSuggestion).set({ status: "approved", decidedAt: new Date() }).where(eq(ownerSuggestion.id, id));
  return true;
}

export async function dismissSuggestion(db: DB, id: number) {
  await db.update(ownerSuggestion).set({ status: "dismissed", decidedAt: new Date() })
    .where(and(eq(ownerSuggestion.id, id), eq(ownerSuggestion.status, "pending")));
}

const FEEDBACK_DAYS = 14;
const FEEDBACK_MIN_VOTES = 5;

/** Tells the owner, at most once a week per team, when a team marks most of its items not useful. */
export async function feedbackNotes(db: DB, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - FEEDBACK_DAYS * 864e5);
  const rows = await db.select({ team: judgment.teamKey, useful: feedback.useful, reason: feedback.reason })
    .from(feedback).innerJoin(judgment, eq(feedback.judgmentId, judgment.id)).where(gte(feedback.createdAt, since));
  const teams = await db.select().from(team);
  const week = isoWeek(now);
  let sent = 0;
  for (const t of teams) {
    const mine = rows.filter((r) => r.team === t.key);
    const bad = mine.filter((r) => !r.useful);
    if (mine.length < FEEDBACK_MIN_VOTES || bad.length / mine.length < 0.5) continue;
    const reasons = bad.map((r) => r.reason?.trim()).filter(Boolean).slice(0, 3).map((r) => `> ${r}`).join("\n");
    const r = await notifyOwner(db, `owner:feedback:${t.key}:${week}`, {
      text: `${t.name} marked most items not useful`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:thinking_face: *${t.name} marked ${bad.length} of ${mine.length} items not useful in the last two weeks.*${reasons ? `\nWhat they said:\n${reasons}` : ""}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Consider sharpening what ${t.name} cares about, or setting it to urgent only. <${config.publicUrl}/settings|Open Settings>` }] },
      ],
    });
    if (r === "sent") sent++;
  }
  return sent;
}

function isoWeek(d: Date) {
  const { date } = localNow(d);
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  return `${y}-W${Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)}`;
}
