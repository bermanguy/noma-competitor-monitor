import { eq } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { setting } from "../db/schema";
import { loadContext } from "../pipeline/assess";
import { judgeItem } from "../pipeline/judge";
import { spend } from "../pipeline/llm";
import { settleEvidence } from "../pipeline/evidence";
import { quotesInSource } from "../pipeline/text";
import { PROMPT_VERSION } from "../prompts/scaffold";
import { type GoldenItem, type Level } from "./golden";
import { examItems } from "./owner-golden";
import { regressions, scoreTeams, topicCheck, type Outcome, type TeamScore, type TopicCheck } from "./score";

export interface EvalResult {
  when: string;
  promptVersion: string;
  model: string;
  graded: number;
  unlabelled: number;
  scores: TeamScore[];
  outcomes: Outcome[];
  failed: string[];
  costUsd: number;
  /** Items whose answer key names the earlier story they repeat: did the judge link them? */
  stories?: StoryCheck[];
  /** Items whose answer key lists fitting topics: did the judge tag one of them? */
  topics?: TopicCheck[];
}

export interface StoryCheck { id: string; expected: number | null; got: number | null; whatsNew: string | null }

/**
 * Judges every labelled golden item with the prompt context found in this database, and grades it per team.
 * Without explicit items it runs the live exam: the golden files plus the items the owner added in the app.
 */
export async function runEval(db: DB, opts: { model?: string; only?: string[]; items?: GoldenItem[] } = {}): Promise<EvalResult> {
  const model = opts.model ?? config.judgeModel;
  const all = opts.items ?? (await examItems(db));
  const items = all.filter((g) => !opts.only || opts.only.includes(g.id));
  const labelled = items.filter((g) => g.expected);
  const ctx = await loadContext(db);
  const teamKeys = ctx.teams.map((t) => t.key);
  const before = (await spend(db)).month;

  const outcomes: Outcome[] = [];
  const failed: string[] = [];
  const stories: StoryCheck[] = [];
  const topicChecks: TopicCheck[] = [];
  const queue = [...labelled];
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      try {
        const first = await judgeItem(db, undefined, {
          competitor: g.competitor, kind: g.kind, pageType: g.pageType, url: g.url, title: g.title,
          publishedAt: g.publishedAt ? new Date(g.publishedAt) : null, text: g.text, diff: g.diff,
          teams: ctx.teams, topics: ctx.topics, company: ctx.owner.company, levels: ctx.owner.levels,
          pageGuidance: g.pageType === "pricing" ? ctx.owner["page.pricing"] : undefined, earlier: g.earlier,
        }, model);
        const sourceText = g.kind === "page_change" ? `${g.text}\n${g.beforeText ?? ""}` : g.text;
        const r = await settleEvidence(db, undefined, first, sourceText, model);
        if (g.expectedTopics?.length) topicChecks.push(topicCheck(g.id, g.expectedTopics, r.judgments.flatMap((x) => x.topics)));
        if (g.expectedSameStoryAs !== undefined) stories.push({ id: g.id, expected: g.expectedSameStoryAs, got: r.sameStoryAs, whatsNew: r.whatsNew });
        for (const team of teamKeys) {
          const expected = g.expected![team];
          if (!expected) continue;
          const j = r.judgments.find((x) => x.team === team);
          const got: Level = j?.level ?? "none";
          outcomes.push({ id: g.id, team, expected, got, evidenceOk: got === "none" || got === "log" || quotesInSource(j?.evidence ?? [], sourceText), why: j?.why, topics: j?.topics });
        }
      } catch (e) {
        failed.push(`${g.id}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return {
    when: new Date().toISOString(), promptVersion: PROMPT_VERSION, model,
    graded: labelled.length - failed.length, unlabelled: items.length - labelled.length,
    scores: scoreTeams(outcomes), outcomes, failed, costUsd: (await spend(db)).month - before, stories, topics: topicChecks,
  };
}

/** The exam as the operator sees it: the last result, the agreed baseline, and whether one is running. */
const LAST = "eval:last";
const BASELINE = "eval:baseline";
const RUNNING = "eval:running";

async function getJson<T>(db: DB, key: string): Promise<T | null> {
  const [row] = await db.select().from(setting).where(eq(setting.key, key));
  return row ? (JSON.parse(row.value) as T) : null;
}
async function setJson(db: DB, key: string, value: unknown) {
  const v = JSON.stringify(value);
  await db.insert(setting).values({ key, value: v }).onConflictDoUpdate({ target: setting.key, set: { value: v, updatedAt: new Date() } });
}

export async function examState(db: DB) {
  const last = await getJson<EvalResult>(db, LAST);
  const baseline = await getJson<EvalResult>(db, BASELINE);
  const running = await getJson<{ since: string }>(db, RUNNING);
  // A run that started over 30 minutes ago and never finished crashed.
  const busy = !!running && Date.now() - new Date(running.since).getTime() < 30 * 60e3;
  return { last, baseline, running: busy, regressions: last ? regressions(last.scores, baseline?.scores ?? null) : [] };
}

/** Runs the exam in the background from the operator view. One at a time. */
export async function startExam(db: DB): Promise<boolean> {
  if ((await examState(db)).running) return false;
  await setJson(db, RUNNING, { since: new Date().toISOString() });
  void runEval(db)
    .then((r) => setJson(db, LAST, r))
    .catch((e) => console.error("exam failed", e))
    .finally(() => db.delete(setting).where(eq(setting.key, RUNNING)));
  return true;
}

export async function saveBaseline(db: DB) {
  const last = await getJson<EvalResult>(db, LAST);
  if (last) await setJson(db, BASELINE, last);
}
