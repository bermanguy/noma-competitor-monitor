/**
 * npm run eval [-- --model <id>] [--only <id,id>] [--save-baseline] [--check]
 *
 * Grades the judge on the golden set and writes a report to evals/reports/.
 * Uses a fresh in-memory database seeded with the starting teams, topics and owner texts, so the
 * result depends only on the repo. --check validates the golden files without calling the model.
 * Exits 1 when a team's precision drops against evals/baseline.json.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/client";
import { seed } from "../src/db/seed";
import { config } from "../src/config";
import { PROMPT_VERSION } from "../src/prompts/scaffold";
import { loadContext } from "../src/pipeline/assess";
import { judgeItem } from "../src/pipeline/judge";
import { spend } from "../src/pipeline/llm";
import { quotesInSource } from "../src/pipeline/text";
import { loadGolden, type Level } from "../src/eval/golden";
import { formatReport, regressions, scoreTeams, type Outcome, type TeamScore } from "../src/eval/score";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const model = value("model") ?? config.judgeModel;
const only = value("only")?.split(",");
const all = loadGolden();
const items = all.filter((g) => !only || only.includes(g.id));
const labelled = items.filter((g) => g.expected);

console.log(`${all.length} golden items, ${labelled.length} labelled${only ? ` (filtered to ${items.length})` : ""}`);
if (flag("check")) process.exit(0);
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

const db = drizzle(new PGlite(), { schema }) as unknown as DB;
await migrate(db as never, { migrationsFolder: "drizzle" });
await seed(db, "http://localhost:3000");
const ctx = await loadContext(db);
const teamKeys = ctx.teams.map((t) => t.key);

const outcomes: Outcome[] = [];
const failed: string[] = [];
const queue = [...labelled];
async function worker() {
  for (let g = queue.shift(); g; g = queue.shift()) {
    try {
      const r = await judgeItem(db, undefined, {
        competitor: g.competitor, kind: g.kind, pageType: g.pageType, url: g.url, title: g.title,
        publishedAt: g.publishedAt ? new Date(g.publishedAt) : null, text: g.text, diff: g.diff,
        teams: ctx.teams, topics: ctx.topics, company: ctx.owner.company, levels: ctx.owner.levels,
        pageGuidance: g.pageType === "pricing" ? ctx.owner["page.pricing"] : undefined,
      }, model);
      const sourceText = g.kind === "page_change" ? `${g.text}\n${g.beforeText ?? ""}` : g.text;
      for (const team of teamKeys) {
        const expected = g.expected![team];
        if (!expected) continue;
        const j = r.judgments.find((x) => x.team === team);
        const got: Level = j?.level ?? "none";
        outcomes.push({ id: g.id, team, expected, got, evidenceOk: got === "none" || got === "log" || quotesInSource(j?.evidence ?? [], sourceText) });
      }
      process.stdout.write(".");
    } catch (e) {
      failed.push(g.id);
      console.error(`\n${g.id}: ${(e as Error).message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log();

const cost = (await spend(db)).month; // fresh database, so this is the cost of this eval
const scores = scoreTeams(outcomes);
const baselinePath = join(process.cwd(), "evals/baseline.json");
const baseline: TeamScore[] | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).scores : null;
const regs = only ? [] : regressions(scores, baseline);
const when = new Date().toISOString().slice(0, 16).replace("T", " ");
const report = formatReport({ promptVersion: PROMPT_VERSION, model, when, scores, outcomes, regressions: regs, failed, unlabelled: items.length - labelled.length, costUsd: Number(cost) });

mkdirSync(join(process.cwd(), "evals/reports"), { recursive: true });
const stem = `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${PROMPT_VERSION}-${model}`;
writeFileSync(join(process.cwd(), "evals/reports", `${stem}.md`), report);
writeFileSync(join(process.cwd(), "evals/reports", `${stem}.json`), JSON.stringify({ promptVersion: PROMPT_VERSION, model, when, scores, outcomes }, null, 2));
if (flag("save-baseline")) writeFileSync(baselinePath, JSON.stringify({ promptVersion: PROMPT_VERSION, model, when, scores }, null, 2));
console.log(report);
process.exit(regs.length || failed.length ? 1 : 0);
