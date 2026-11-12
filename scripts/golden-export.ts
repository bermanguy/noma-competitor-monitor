/**
 * npm run golden:export -- --ids 12,15,40   or   --latest 20
 *
 * Promotes judged items from the live database into evals/golden/ as unlabelled exam items.
 * The model's own levels are deliberately left out, so the labeller decides without being anchored
 * on the answer under test. Existing files are never overwritten.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { competitor, item, source } from "../src/db/schema";
import { GOLDEN_DIR, type GoldenItem } from "../src/eval/golden";

const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const ids = value("ids")?.split(",").map(Number);
const latest = Number(value("latest") ?? 0);
if (!ids && !latest) { console.error("pass --ids 1,2,3 or --latest N"); process.exit(2); }

const base = db()
  .select({ i: item, c: competitor, pageType: source.pageType })
  .from(item)
  .innerJoin(competitor, eq(item.competitorId, competitor.id))
  .innerJoin(source, eq(item.sourceId, source.id));
const rows = ids
  ? await base.where(inArray(item.id, ids))
  : await base.where(eq(item.status, "judged")).orderBy(desc(item.id)).limit(latest);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
let written = 0;
for (const { i, c, pageType } of rows) {
  if (i.isCanary) continue;
  const id = `live-${slug(c.name)}-${slug(i.title ?? new URL(i.url).pathname)}`;
  const file = join(GOLDEN_DIR, `${id}.json`);
  if (existsSync(file)) continue;
  const g: GoldenItem = {
    id, origin: "live", competitor: c.name, kind: i.kind, pageType, url: i.url, title: i.title,
    publishedAt: i.publishedAt?.toISOString().slice(0, 10) ?? null, text: i.text, diff: i.diff, beforeText: i.beforeText,
    expected: null, labelledBy: null, note: "", tags: [],
  };
  writeFileSync(file, `${JSON.stringify(g, null, 2)}\n`);
  written++;
}
console.log(`wrote ${written} new golden items (unlabelled)`);
process.exit(0);
