import { and, desc, eq, inArray } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { team, teamEdit, type Level } from "../db/schema";
import { sendOnce } from "../pipeline/deliver";
import { localDateTime } from "../lib/time";
import { claimRunner, examState, releaseRunner, runEval, setBaseline, setLast, type EvalResult } from "./run";
import { examItems, goldenAnswers, regrade, type AnswerOverrides } from "./owner-golden";
import { scoreTeams, type Outcome } from "./score";

/**
 * An owner's edit to their team's description goes live only after it is checked on the golden set.
 *
 * Save starts an eval run with the draft. When it finishes, every answer is compared with the same
 * item in the baseline run. If no team got worse, the edit goes live by itself and the run becomes the
 * new baseline. If a team got worse, the owner sees exactly which posts, and can narrow the wording,
 * correct their own team's answer key, or save anyway (the builder is told).
 *
 * One edit can change other teams' answers too, because one judge call decides for every team. That is
 * why the check covers all teams, and why an owner can only correct their own team's answers.
 */

const RANK: Record<Level, number> = { none: 0, log: 1, digest: 2, alert: 3 };
const distance = (a: Level, b: Level) => Math.abs(RANK[a] - RANK[b]);
const isSevere = (expected: Level, got: Level) =>
  (expected === "alert" && got !== "alert" && got !== "digest") || (expected === "none" && got === "alert");

export interface EditChange {
  id: string;
  team: string;
  expected: Level;
  before: Level;
  after: Level;
  severe: boolean;
  why?: string;
}

export interface EditVerdict {
  /** Nothing got worse beyond normal variation: the edit can go live. */
  ok: boolean;
  /** Answers further from the answer key than in the baseline. */
  worse: EditChange[];
  /** Answers closer to the answer key than in the baseline. */
  better: EditChange[];
  /** Teams where enough got worse to hold the edit back. */
  blockingTeams: string[];
  /** Items graded only in this run (added after the baseline), wrong now. Shown, never blocking. */
  newItemsWrong: { id: string; team: string; expected: Level; got: Level }[];
}

/**
 * The judge does not answer exactly the same way twice: on an unchanged prompt one answer in thirty can
 * move a step. So one answer one step worse is shown as likely noise; a team is held back when two or
 * more of its answers got worse, or when any answer became a severe miss.
 */
export const WORSE_PER_TEAM = 2;

export function editVerdict(after: Outcome[], before: Outcome[]): EditVerdict {
  const prev = new Map(before.map((o) => [`${o.id}|${o.team}`, o]));
  const worse: EditChange[] = [];
  const better: EditChange[] = [];
  const newItemsWrong: EditVerdict["newItemsWrong"] = [];
  for (const o of after) {
    const p = prev.get(`${o.id}|${o.team}`);
    if (!p) {
      if (o.got !== o.expected) newItemsWrong.push({ id: o.id, team: o.team, expected: o.expected, got: o.got });
      continue;
    }
    const d0 = distance(p.got, o.expected);
    const d1 = distance(o.got, o.expected);
    const change = { id: o.id, team: o.team, expected: o.expected, before: p.got, after: o.got, severe: isSevere(o.expected, o.got) && !isSevere(o.expected, p.got), why: o.why };
    if (d1 > d0) worse.push(change);
    else if (d1 < d0) better.push(change);
  }
  const teams = [...new Set(worse.map((w) => w.team))];
  const blockingTeams = teams.filter((t) => {
    const w = worse.filter((x) => x.team === t);
    return w.length >= WORSE_PER_TEAM || w.some((x) => x.severe);
  });
  return { ok: blockingTeams.length === 0, worse, better, blockingTeams, newItemsWrong };
}

/** The verdict for a finished check, against the answer key as it is now (owners may have corrected it). */
export function verdictFor(result: EvalResult, baseline: EvalResult | null, answers: AnswerOverrides): EditVerdict {
  const after = regrade(result.outcomes, answers);
  // Without a baseline, compare with the answer key alone: everything right counts as "before".
  const before = baseline ? regrade(baseline.outcomes, answers) : after.map((o) => ({ ...o, got: o.expected }));
  return editVerdict(after, before);
}

export type TeamEditRow = typeof teamEdit.$inferSelect;

/** The edit to show on a team's page: the one being checked, or one waiting for the owner. */
export async function openEdit(db: DB, teamKey: string): Promise<TeamEditRow | null> {
  const [r] = await db.select().from(teamEdit)
    .where(and(eq(teamEdit.teamKey, teamKey), inArray(teamEdit.status, ["checking", "ready"])))
    .orderBy(desc(teamEdit.id)).limit(1);
  return r ?? null;
}

/** The latest edit to show: open, or decided in the last 15 minutes so the owner sees how it ended. */
export async function editToShow(db: DB, teamKey: string): Promise<TeamEditRow | null> {
  const [r] = await db.select().from(teamEdit).where(eq(teamEdit.teamKey, teamKey)).orderBy(desc(teamEdit.id)).limit(1);
  if (!r || r.status === "discarded") return null;
  if (["checking", "ready", "failed"].includes(r.status)) return r;
  return r.decidedAt && Date.now() - r.decidedAt.getTime() < 15 * 60e3 ? r : null;
}

export async function getEdit(db: DB, id: number): Promise<TeamEditRow | null> {
  const [r] = await db.select().from(teamEdit).where(eq(teamEdit.id, id));
  return r ?? null;
}

/**
 * Starts checking a draft description. Returns the edit's id, or an error the owner can act on.
 * The check runs in the background; the page polls the row.
 */
export async function startEditCheck(db: DB, teamKey: string, lens: string, by: string): Promise<{ id: number } | { error: string }> {
  const [t] = await db.select().from(team).where(eq(team.key, teamKey));
  if (!t) return { error: "No such team" };
  if (t.lens.trim() === lens.trim()) return { error: "The description is unchanged" };
  if (!(await claimRunner(db))) return { error: "Another check is running. Try again in about 2 minutes." };
  // An older open edit for this team is replaced by the new one.
  await db.update(teamEdit).set({ status: "discarded", decidedAt: new Date() })
    .where(and(eq(teamEdit.teamKey, teamKey), inArray(teamEdit.status, ["checking", "ready"])));
  const baseline = (await examState(db)).baseline;
  const [row] = await db.insert(teamEdit).values({ teamKey, lens, previousLens: t.lens, status: "checking", baseline, createdBy: by }).returning();
  if (!row) { await releaseRunner(db); return { error: "Could not start the check" }; }
  void finishEditCheck(db, row.id, teamKey, lens, baseline).finally(() => releaseRunner(db));
  return { id: row.id };
}

async function finishEditCheck(db: DB, id: number, teamKey: string, lens: string, baseline: EvalResult | null) {
  try {
    const result = await runEval(db, { lens: { teamKey, lens }, items: await examItems(db) });
    await db.update(teamEdit).set({ result, status: "ready" }).where(eq(teamEdit.id, id));
    const v = verdictFor(result, baseline, await goldenAnswers(db));
    if (v.ok) await applyEdit(db, id, "saved");
  } catch (e) {
    console.error("edit check failed", e);
    await db.update(teamEdit).set({ status: "failed", error: (e as Error).message.slice(0, 300) }).where(eq(teamEdit.id, id));
  }
}

/**
 * Puts the edit live. The checked run becomes the latest run and the baseline, so the next edit is
 * compared with today's wording. "saved_anyway" also tells the builder in the ops channel.
 */
export async function applyEdit(db: DB, id: number, how: "saved" | "saved_anyway", by?: string): Promise<boolean> {
  const e = await getEdit(db, id);
  if (!e || e.status !== "ready" || !e.result) return false;
  const result = e.result as EvalResult;
  const answers = await goldenAnswers(db);
  const regraded = { ...result, outcomes: regrade(result.outcomes, answers), scores: scoreTeams(regrade(result.outcomes, answers)) };
  await db.update(team).set({ lens: e.lens }).where(eq(team.key, e.teamKey));
  await db.update(teamEdit).set({ status: how, decidedAt: new Date() }).where(eq(teamEdit.id, id));
  await setLast(db, regraded);
  await setBaseline(db, regraded);
  if (how === "saved_anyway" && process.env[config.opsWebhookEnv]) {
    const v = verdictFor(result, e.baseline as EvalResult | null, answers);
    const lines = v.worse.filter((w) => v.blockingTeams.includes(w.team)).slice(0, 6).map((w) => `• ${w.team}: ${w.id}: ${w.before} → ${w.after} (answer key: ${w.expected})`);
    await sendOnce(db, `team-edit:${id}`, { kind: "ops", teamKey: null, judgmentIds: [] }, config.opsWebhookEnv, {
      text: `${by ?? "An owner"} saved a ${e.teamKey} description edit although the check found it worse`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:information_source: *${by ?? "An owner"} saved a change to what ${e.teamKey} cares about, although the check found answers that got worse.* Nothing to approve; this is for the record.\n${lines.join("\n")}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `${localDateTime(new Date())} · <${config.publicUrl}/ops/evals|Open Evals>` }] },
      ],
    }).catch((err) => console.error("ops note failed", err));
  }
  return true;
}

export async function discardEdit(db: DB, id: number) {
  await db.update(teamEdit).set({ status: "discarded", decidedAt: new Date() })
    .where(and(eq(teamEdit.id, id), inArray(teamEdit.status, ["ready", "failed"])));
}
