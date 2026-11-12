import { and, desc, eq } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, item, judgment, setting, source, type Level } from "../db/schema";
import { earlierItems, loadContext } from "../pipeline/assess";
import { judgeItem } from "../pipeline/judge";
import { spend } from "../pipeline/llm";
import { quotesInSource } from "../pipeline/text";

/**
 * "What would change if I saved this?" The owner edits a team's description and, before saving,
 * re-judges that team's most recent real items with the draft. Nothing is saved or sent: the result
 * is kept only so the page can show it. It costs one judge call per item (a few cents each).
 */

export interface PreviewRow {
  itemId: number;
  title: string | null;
  competitor: string;
  url: string;
  before: Level;
  after: Level;
  why: string;
  /** A sent level whose quote is not in the source would be held back in production, as today. */
  quoteOk: boolean;
  error?: string;
}

export interface LensPreview {
  teamKey: string;
  draft: string;
  /** The description the preview was compared with, so a stale preview can be recognised. */
  current: string;
  when: string;
  rows: PreviewRow[];
  costUsd: number;
}

const key = (teamKey: string) => `lens-preview:${teamKey}`;
const sent = (l: Level) => l === "alert" || l === "digest";

export async function getPreview(db: DB, teamKey: string): Promise<LensPreview | null> {
  const [row] = await db.select().from(setting).where(eq(setting.key, key(teamKey)));
  return row ? (JSON.parse(row.value) as LensPreview) : null;
}

export async function clearPreview(db: DB, teamKey: string) {
  await db.delete(setting).where(eq(setting.key, key(teamKey)));
}

/** The team's most recent judged items, excluding the canary, with the level the team got. */
export async function recentForTeam(db: DB, teamKey: string, limit: number) {
  return db
    .select({ i: item, c: competitor, s: source, j: judgment })
    .from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(source, eq(item.sourceId, source.id))
    .where(and(eq(judgment.teamKey, teamKey), eq(item.status, "judged"), eq(item.isCanary, false)))
    .orderBy(desc(item.firstSeenAt))
    .limit(limit);
}

export async function runPreview(db: DB, teamKey: string, draft: string, limit = 6): Promise<LensPreview> {
  const ctx = await loadContext(db);
  const current = ctx.teams.find((t) => t.key === teamKey);
  if (!current) throw new Error(`Unknown team ${teamKey}`);
  const teams = ctx.teams.map((t) => (t.key === teamKey ? { ...t, lens: draft } : t));
  const recent = await recentForTeam(db, teamKey, limit);
  const before = (await spend(db)).month;

  const rows: PreviewRow[] = [];
  const queue = [...recent];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const base = { itemId: r.i.id, title: r.i.title, competitor: r.c.name, url: r.i.url, before: r.j.evidenceOk ? r.j.level : "log" as Level };
      try {
        const out = await judgeItem(db, undefined, {
          competitor: r.c.name, kind: r.i.kind, pageType: r.s.pageType, url: r.i.url, title: r.i.title,
          publishedAt: r.i.publishedAt, text: r.i.text, diff: r.i.diff,
          teams, topics: ctx.topics, examples: ctx.examples,
          company: ctx.owner.company, levels: ctx.owner.levels,
          pageGuidance: r.s.pageType === "pricing" ? ctx.owner["page.pricing"] : undefined,
          earlier: await earlierItems(db, r.c.id, r.i.id),
        }, config.judgeModel);
        const j = out.judgments.find((x) => x.team === teamKey);
        const after: Level = j?.level ?? "none";
        const sourceText = r.i.kind === "page_change" ? `${r.i.text}\n${r.i.beforeText ?? ""}` : r.i.text;
        rows.push({ ...base, after, why: j?.why ?? "", quoteOk: !sent(after) || quotesInSource(j?.evidence ?? [], sourceText) });
      } catch (e) {
        rows.push({ ...base, after: base.before, why: "", quoteOk: true, error: (e as Error).message.slice(0, 160) });
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  const order = new Map(recent.map((r, n) => [r.i.id, n]));
  rows.sort((a, b) => order.get(a.itemId)! - order.get(b.itemId)!);

  const preview: LensPreview = {
    teamKey, draft, current: current.lens, when: new Date().toISOString(), rows,
    costUsd: (await spend(db)).month - before,
  };
  const value = JSON.stringify(preview);
  await db.insert(setting).values({ key: key(teamKey), value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
  return preview;
}

/** One line for the owner: how many items move, and in which direction. */
export function previewSummary(p: LensPreview): { gained: number; lost: number; moved: number; same: number } {
  let gained = 0, lost = 0, moved = 0, same = 0;
  for (const r of p.rows) {
    if (r.error) continue;
    const a = sent(r.after) && r.quoteOk;
    const b = sent(r.before);
    if (a && !b) gained++;
    else if (!a && b) lost++;
    else if (r.after !== r.before) moved++;
    else same++;
  }
  return { gained, lost, moved, same };
}

