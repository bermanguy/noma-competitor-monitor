import { desc, eq, inArray, and } from "drizzle-orm";
import type { DB } from "../db/client";
import { competitor, item, source } from "../db/schema";
import type { GoldenItem } from "./golden";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Judged live items as unlabelled exam items. The model's own levels are deliberately left out,
 * so the labeller decides without being anchored on the answer under test.
 */
export async function exportGolden(db: DB, opts: { ids?: number[]; latest?: number }): Promise<GoldenItem[]> {
  const base = db.select({ i: item, c: competitor, pageType: source.pageType }).from(item)
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(source, eq(item.sourceId, source.id));
  const rows = opts.ids?.length
    ? await base.where(inArray(item.id, opts.ids))
    : await base.where(and(eq(item.status, "judged"), eq(item.isCanary, false))).orderBy(desc(item.id)).limit(opts.latest ?? 30);
  return rows.filter((r) => !r.i.isCanary).map(({ i, c, pageType }) => ({
    id: `live-${slug(c.name)}-${slug(i.title ?? new URL(i.url).pathname)}`,
    origin: "live", competitor: c.name, kind: i.kind, pageType, url: i.url, title: i.title,
    publishedAt: i.publishedAt?.toISOString().slice(0, 10) ?? null, text: i.text, diff: i.diff, beforeText: i.beforeText,
    expected: null, labelledBy: null, note: "", tags: [],
  }));
}
