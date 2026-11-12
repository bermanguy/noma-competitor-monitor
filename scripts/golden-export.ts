/**
 * Adds real items to the golden set as unlabelled exam items. Existing files are never overwritten.
 *
 *   npm run golden:export -- --latest 20          from the database (needs DATABASE_URL)
 *   npm run golden:export -- --ids 12,15,40
 *   npm run golden:export -- --from-file x.json   from the operator view's "Download for the exam"
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GOLDEN_DIR, GoldenItem } from "../src/eval/golden";

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = value("from-file");
const ids = value("ids")?.split(",").map(Number);
const latest = Number(value("latest") ?? 0);
if (!file && !ids && !latest) { console.error("pass --latest N, --ids 1,2,3 or --from-file path"); process.exit(2); }

let items: GoldenItem[];
if (file) {
  items = (JSON.parse(readFileSync(file, "utf8")) as unknown[]).map((x) => GoldenItem.parse(x));
} else {
  const { db } = await import("../src/db/client");
  const { exportGolden } = await import("../src/eval/export");
  items = await exportGolden(db(), { ids, latest });
}

let written = 0;
for (const g of items) {
  const path = join(GOLDEN_DIR, `${g.id}.json`);
  if (existsSync(path)) continue;
  writeFileSync(path, `${JSON.stringify(g, null, 2)}\n`);
  written++;
}
console.log(`wrote ${written} new golden items (unlabelled), skipped ${items.length - written} already present`);
process.exit(0);
