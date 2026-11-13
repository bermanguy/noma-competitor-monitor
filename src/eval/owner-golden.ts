import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { competitor, feedback, goldenAnswer, goldenItem, item, judgment, team, type Level } from "../db/schema";
import { exportGolden } from "./export";
import { GoldenItem, loadGolden } from "./golden";

/**
 * Closes the feedback loop. A team member marks an item "not useful" in Slack; the owner sees it in
 * "To review", picks the level each team should have got, and the item becomes a golden-set item. From
 * then on every eval run checks the judge against the owner's answer, so the same mistake is caught.
 */

export const REVIEW_DAYS = 14;
export const ownerExamId = (itemId: number) => `owner-${itemId}`;

export interface ReviewVote { team: string; level: Level; why: string; reason: string | null; at: Date }
export interface ReviewItem {
  itemId: number;
  competitor: string;
  title: string;
  url: string;
  /** The level the judge gave each team, as the starting answer the owner corrects. */
  levels: Record<string, Level>;
  votes: ReviewVote[];
  /** From the canary test page: reviewable, so the loop can be shown end to end, and labelled as a test. */
  isTest: boolean;
}

/** Items a team marked not useful in the last two weeks that are not in the exam yet. Most recent vote first. */
export async function toReview(db: DB, now = new Date()): Promise<ReviewItem[]> {
  const since = new Date(now.getTime() - REVIEW_DAYS * 864e5);
  const rows = await db
    .select({ f: feedback, j: judgment, i: item, c: competitor })
    .from(feedback)
    .innerJoin(judgment, eq(feedback.judgmentId, judgment.id))
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(and(eq(feedback.useful, false), gte(feedback.createdAt, since)))
    .orderBy(desc(feedback.createdAt));
  if (!rows.length) return [];
  const inExam = new Set((await db.select({ id: goldenItem.fromItemId }).from(goldenItem)).map((r) => r.id));
  const fileUrls = new Set(loadGolden().map((g) => g.url));
  const byItem = new Map<number, ReviewItem>();
  for (const { f, j, i, c } of rows) {
    if (inExam.has(i.id) || fileUrls.has(i.url)) continue;
    const r = byItem.get(i.id) ?? { itemId: i.id, competitor: c.name, title: i.title ?? i.url, url: i.url, levels: {}, votes: [], isTest: i.isCanary };
    r.votes.push({ team: j.teamKey, level: j.level, why: j.why, reason: f.reason, at: f.createdAt });
    byItem.set(i.id, r);
  }
  const ids = [...byItem.keys()];
  if (ids.length) {
    for (const j of await db.select().from(judgment).where(inArray(judgment.itemId, ids))) byItem.get(j.itemId)!.levels[j.teamKey] = j.level;
  }
  return [...byItem.values()];
}

/** Writes the item as an exam item with the owner's level for each team. Adding it again replaces the answer. */
export async function addToExam(db: DB, itemId: number, expected: Record<string, Level>, note: string): Promise<GoldenItem | null> {
  const [draft] = await exportGolden(db, { ids: [itemId] });
  const teams = new Set((await db.select({ key: team.key }).from(team)).map((t) => t.key));
  const levels = Object.fromEntries(Object.entries(expected).filter(([k]) => teams.has(k)));
  if (!draft || !Object.keys(levels).length) return null;
  const g = GoldenItem.parse({
    ...draft, id: ownerExamId(itemId), expected: levels, labelledBy: "owner",
    note: note.trim().slice(0, 1000) || "Added by the owner from a team's not-useful vote.", tags: ["from-feedback"],
  });
  await db.insert(goldenItem).values({ id: g.id, fromItemId: itemId, data: g })
    .onConflictDoUpdate({ target: goldenItem.id, set: { data: g, createdAt: new Date() } });
  return g;
}

/** Exam items the owner added in the app. */
export async function ownerGolden(db: DB): Promise<GoldenItem[]> {
  const rows = await db.select().from(goldenItem).orderBy(goldenItem.createdAt);
  return rows.map((r) => GoldenItem.parse(r.data));
}

/** The live exam: the golden files plus the owner's items. A file with the same page wins, so nothing is graded twice. */
export async function examItems(db: DB, files: GoldenItem[] = loadGolden()): Promise<GoldenItem[]> {
  const urls = new Set(files.map((g) => g.url));
  const all = [...files, ...(await ownerGolden(db)).filter((g) => !urls.has(g.url))];
  return applyAnswers(all, await goldenAnswers(db));
}

export type AnswerOverrides = Map<string, Level>;
const answerKey = (id: string, team: string) => `${id}|${team}`;

/** The answers team owners corrected in the app, by golden id and team. */
export async function goldenAnswers(db: DB): Promise<AnswerOverrides> {
  const rows = await db.select().from(goldenAnswer);
  return new Map(rows.map((r) => [answerKey(r.goldenId, r.teamKey), r.level as Level]));
}

/** The answer key with each owner's corrections for their own team on top. */
export function applyAnswers(items: GoldenItem[], answers: AnswerOverrides): GoldenItem[] {
  if (!answers.size) return items;
  return items.map((g) => {
    if (!g.expected) return g;
    const expected = { ...g.expected };
    for (const team of Object.keys(expected)) {
      const a = answers.get(answerKey(g.id, team));
      if (a) expected[team] = a;
    }
    return { ...g, expected };
  });
}

/** Re-grades stored outcomes against the current answer key, so a corrected answer counts without re-judging. */
export function regrade<T extends { id: string; team: string; expected: Level }>(outcomes: T[], answers: AnswerOverrides): T[] {
  return outcomes.map((o) => ({ ...o, expected: answers.get(answerKey(o.id, o.team)) ?? o.expected }));
}

/** A team owner sets the right level for their own team on one golden-set item. */
export async function setGoldenAnswer(db: DB, goldenId: string, teamKey: string, level: Level, by: string) {
  await db.insert(goldenAnswer).values({ goldenId, teamKey, level, setBy: by })
    .onConflictDoUpdate({ target: [goldenAnswer.goldenId, goldenAnswer.teamKey], set: { level, setBy: by, setAt: new Date() } });
}
