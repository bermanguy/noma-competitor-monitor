import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { competitor, feedback, item, judgment, ownerSuggestion, source, team, type Level } from "../db/schema";
import { sourceHealth } from "../pipeline/health";

/**
 * What the business owner's inbox shows: the decisions waiting for them, and how each team is doing.
 * Read-only queries over the same tables the pipeline writes; nothing here calls a model.
 */

export interface TeamSummary {
  key: string;
  name: string;
  noise: "quiet" | "normal";
  lens: string;
  slackConnected: boolean;
  /** Last `days` days, by level. Sent levels count only judgments with a checked quote, as delivery does. */
  counts: Record<Level, number>;
  held: number;
  rated: number;
  useful: number;
  notUseful: { title: string | null; reason: string | null; at: Date }[];
  lastSent: { title: string | null; competitor: string; level: Level; at: Date; url: string } | null;
}

export async function teamSummaries(db: DB, days = 7, now = new Date()): Promise<TeamSummary[]> {
  const since = new Date(+now - days * 864e5);
  const teams = await db.select().from(team).orderBy(team.id);
  const js = await db
    .select({ j: judgment, title: item.title, url: item.url, at: item.firstSeenAt, comp: competitor.name })
    .from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(and(eq(item.status, "judged"), gte(item.firstSeenAt, since)))
    .orderBy(desc(item.firstSeenAt));
  const fbSince = new Date(+now - 30 * 864e5);
  const fb = await db
    .select({ team: judgment.teamKey, useful: feedback.useful, reason: feedback.reason, at: feedback.createdAt, title: item.title })
    .from(feedback)
    .innerJoin(judgment, eq(feedback.judgmentId, judgment.id))
    .innerJoin(item, eq(judgment.itemId, item.id))
    .where(gte(feedback.createdAt, fbSince))
    .orderBy(desc(feedback.createdAt));

  return teams.map((t) => {
    const mine = js.filter((x) => x.j.teamKey === t.key);
    const counts: Record<Level, number> = { alert: 0, digest: 0, log: 0, none: 0 };
    let held = 0;
    for (const x of mine) {
      const sentLevel = x.j.level === "alert" || x.j.level === "digest";
      if (sentLevel && !x.j.evidenceOk) held++;
      else counts[x.j.level]++;
    }
    const sent = mine.find((x) => (x.j.level === "alert" || x.j.level === "digest") && x.j.evidenceOk);
    const ratings = fb.filter((f) => f.team === t.key);
    return {
      key: t.key, name: t.name, noise: t.noise, lens: t.lens,
      slackConnected: !!process.env[t.slackWebhookEnv],
      counts, held,
      rated: ratings.length,
      useful: ratings.filter((r) => r.useful).length,
      notUseful: ratings.filter((r) => !r.useful).map((r) => ({ title: r.title, reason: r.reason, at: r.at })),
      lastSent: sent ? { title: sent.title, competitor: sent.comp, level: sent.j.level, at: sent.at, url: sent.url } : null,
    };
  });
}

export type Task =
  | { kind: "suggestion"; id: number; whatChanged: string; at: Date }
  | { kind: "unhappy-team"; teamKey: string; teamName: string; count: number; reasons: string[] }
  | { kind: "nothing-to-watch"; competitor: string }
  | { kind: "source-problem"; competitor: string; label: string; reason: string }
  | { kind: "first-check"; competitor: string; sources: number };

/** Decisions waiting for the owner first, then things they should know about but need not act on. */
export async function ownerTasks(db: DB, summaries: TeamSummary[], now = new Date()): Promise<{ todo: Task[]; fyi: Task[] }> {
  const todo: Task[] = [];
  const fyi: Task[] = [];
  const pending = await db.select().from(ownerSuggestion).where(eq(ownerSuggestion.status, "pending")).orderBy(desc(ownerSuggestion.id));
  for (const s of pending) todo.push({ kind: "suggestion", id: s.id, whatChanged: s.whatChanged, at: s.createdAt });

  // A team that marked items "not useful" in the last two weeks: the owner may want to sharpen its description.
  const twoWeeks = new Date(+now - 14 * 864e5);
  for (const t of summaries) {
    const recent = t.notUseful.filter((n) => n.at >= twoWeeks);
    if (recent.length > 0) {
      todo.push({ kind: "unhappy-team", teamKey: t.key, teamName: t.name, count: recent.length, reasons: recent.map((r) => r.reason || `"${r.title ?? "an item"}", no reason given`).slice(0, 3) });
    }
  }

  const comps = await db.select().from(competitor).where(eq(competitor.active, true)).orderBy(competitor.name);
  const srcs = comps.length ? await db.select().from(source).where(and(eq(source.active, true), inArray(source.competitorId, comps.map((c) => c.id)))) : [];
  for (const c of comps) {
    const mine = srcs.filter((s) => s.competitorId === c.id);
    if (mine.length === 0) { todo.push({ kind: "nothing-to-watch", competitor: c.name }); continue; }
    const waiting = mine.filter((s) => !s.baselinedAt);
    if (waiting.length === mine.length) fyi.push({ kind: "first-check", competitor: c.name, sources: mine.length });
    for (const s of mine) {
      const h = sourceHealth(s, now);
      if (h.health === "failing" || h.health === "quiet") fyi.push({ kind: "source-problem", competitor: c.name, label: s.label, reason: h.reason });
    }
  }
  return { todo, fyi };
}

/** The latest items that reached at least one team, newest first. */
export async function latestSent(db: DB, limit = 6) {
  const rows = await db
    .select({ i: item, c: competitor })
    .from(item)
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(eq(item.status, "judged"))
    .orderBy(desc(item.firstSeenAt))
    .limit(60);
  if (rows.length === 0) return [];
  const js = await db.select().from(judgment).where(inArray(judgment.itemId, rows.map((r) => r.i.id)));
  return rows
    .map((r) => ({ ...r, teams: js.filter((j) => j.itemId === r.i.id && (j.level === "alert" || j.level === "digest") && j.evidenceOk) }))
    .filter((r) => r.teams.length > 0)
    .slice(0, limit);
}
