import { desc, eq } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, feedback, item, judgment, source, team, topic } from "../db/schema";
import { PROMPT_VERSION } from "../prompts/scaffold";
import { judgeItem, type JudgeResult } from "./judge";
import { BudgetExceeded, Refused } from "./llm";
import { quotesInSource } from "./text";

/** Recent rated items, per team, shown to the model as examples of what this team found useful or not. */
export async function ratedExamples(db: DB, limitPerTeam = 4): Promise<string> {
  const rows = await db
    .select({ team: judgment.teamKey, level: judgment.level, why: judgment.why, title: item.title, useful: feedback.useful, reason: feedback.reason })
    .from(feedback)
    .innerJoin(judgment, eq(feedback.judgmentId, judgment.id))
    .innerJoin(item, eq(judgment.itemId, item.id))
    .orderBy(desc(feedback.createdAt))
    .limit(60);
  const per = new Map<string, string[]>();
  for (const r of rows) {
    const list = per.get(r.team) ?? [];
    if (list.length >= limitPerTeam) continue;
    list.push(`- [${r.team}] "${r.title}" was sent as ${r.level}; the team said ${r.useful ? "USEFUL" : "NOT USEFUL"}${r.reason ? `: ${r.reason}` : ""}`);
    per.set(r.team, list);
  }
  return [...per.values()].flat().join("\n");
}

export async function loadContext(db: DB) {
  const teams = await db.select().from(team).orderBy(team.id);
  const topics = (await db.select().from(topic).where(eq(topic.active, true))).map((t) => ({
    name: t.name,
    description: `${t.description} (matters to: ${t.teamKeys.join(", ")})`,
  }));
  return { teams, topics, examples: await ratedExamples(db) };
}

/** Stores one judgment per team. A judgment whose quotes are not in the source is kept but never sent. */
export async function saveJudgments(db: DB, itemId: number, sourceText: string, result: JudgeResult, teamKeys: string[], model: string) {
  for (const key of teamKeys) {
    const j = result.judgments.find((x) => x.team === key);
    const level = j?.level ?? "none";
    const evidence = j?.evidence ?? [];
    await db.insert(judgment).values({
      itemId, teamKey: key, level,
      why: j?.why ?? "No judgment returned for this team.",
      evidence, topics: j?.topics ?? [],
      evidenceOk: level === "none" || level === "log" ? true : quotesInSource(evidence, sourceText),
      model, promptVersion: PROMPT_VERSION,
    }).onConflictDoNothing();
  }
}

/** Judges every pending item. Stops cleanly when the budget is reached; the rest wait for the next run. */
export async function assessPending(db: DB, runId: number) {
  const pending = await db
    .select({ i: item, c: competitor, pageType: source.pageType })
    .from(item)
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(source, eq(item.sourceId, source.id))
    .where(eq(item.status, "pending"))
    .orderBy(item.id)
    .limit(40);
  if (pending.length === 0) return { judged: 0, held: 0, stoppedForBudget: false };
  const ctx = await loadContext(db);
  let judged = 0;
  let held = 0;
  for (const { i, c, pageType } of pending) {
    try {
      const result = await judgeItem(db, runId, {
        competitor: c.name, kind: i.kind, pageType, url: i.url, title: i.title, publishedAt: i.publishedAt,
        text: i.text, diff: i.diff, teams: ctx.teams, topics: ctx.topics, examples: ctx.examples,
      });
      const sourceText = i.kind === "page_change" ? `${i.text}\n${i.beforeText ?? ""}` : i.text;
      await saveJudgments(db, i.id, sourceText, result, ctx.teams.map((t) => t.key), config.judgeModel);
      await db.update(item).set({ status: "judged", statusDetail: result.summary }).where(eq(item.id, i.id));
      judged++;
    } catch (e) {
      if (e instanceof BudgetExceeded) return { judged, held, stoppedForBudget: true };
      const refused = e instanceof Refused;
      await db.update(item).set({ status: refused ? "held" : "failed", statusDetail: (e as Error).message.slice(0, 500) }).where(eq(item.id, i.id));
      held++;
    }
  }
  return { judged, held, stoppedForBudget: false };
}
