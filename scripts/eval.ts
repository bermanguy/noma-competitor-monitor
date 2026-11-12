/**
 * npm run eval [-- --model <id>] [--only <id,id>] [--save-baseline] [--check]
 *
 * Grades the judge on the golden set and writes a report to evals/reports/.
 * Uses a fresh in-memory database seeded with the starting teams, topics and owner texts, so the
 * result depends only on the repo. --check validates the golden files without calling the model.
 * Exits 1 when a team's precision drops against evals/baseline.json.
 * The same exam runs against the live prompts from the operator view ("Run the exam").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/client";
import { seed } from "../src/db/seed";
import { loadGolden } from "../src/eval/golden";
import { runEval } from "../src/eval/run";
import { formatReport, regressions, type TeamScore } from "../src/eval/score";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const only = value("only")?.split(",");
const all = loadGolden();
console.log(`${all.length} golden items, ${all.filter((g) => g.expected).length} labelled`);
if (flag("check")) process.exit(0);
if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(2); }

const db = drizzle(new PGlite(), { schema }) as unknown as DB;
await migrate(db as never, { migrationsFolder: "drizzle" });
await seed(db, "http://localhost:3000");
const r = await runEval(db, { model: value("model"), only, items: all });

const baselinePath = join(process.cwd(), "evals/baseline.json");
const baseline: TeamScore[] | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).scores : null;
const regs = only ? [] : regressions(r.scores, baseline);
const when = r.when.slice(0, 16).replace("T", " ");
const report = formatReport({ promptVersion: r.promptVersion, model: r.model, when, scores: r.scores, outcomes: r.outcomes, regressions: regs, failed: r.failed, unlabelled: r.unlabelled, costUsd: r.costUsd, stories: r.stories });

mkdirSync(join(process.cwd(), "evals/reports"), { recursive: true });
const stem = `${r.when.slice(0, 16).replace(/[:T]/g, "-")}-${r.promptVersion}-${r.model}`;
writeFileSync(join(process.cwd(), "evals/reports", `${stem}.md`), report);
writeFileSync(join(process.cwd(), "evals/reports", `${stem}.json`), JSON.stringify(r, null, 2));
if (flag("save-baseline")) writeFileSync(baselinePath, JSON.stringify({ promptVersion: r.promptVersion, model: r.model, when, scores: r.scores }, null, 2));
console.log(report);
process.exit(regs.length || r.failed.length ? 1 : 0);
