import { and, desc, eq, inArray } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, item, snapshot, source, sourceRun } from "../db/schema";
import { extractListingLinks, extractMain, parseFeed } from "./extract";
import { fetchSource } from "./fetch";
import { gateChange } from "./judge";
import { diffPricing, extractPricing, formatPricingChanges, verifyPricing, type PricingSnapshot } from "./pricing";
import { diffText, formatDiff, hash, normalizeText } from "./text";

type Source = typeof source.$inferSelect;
type Competitor = typeof competitor.$inferSelect;

export interface CollectStats {
  ok: boolean;
  newItems: number;
  error?: string;
}

/** Posts published this long before monitoring started are history, not news. */
const OLD_POST_DAYS = 14;

/** Collects one source. Never throws: a failure is recorded on the source and the run moves on. */
export async function collectSource(db: DB, runId: number, s: Source, c: Competitor): Promise<CollectStats> {
  const started = Date.now();
  let stats: CollectStats;
  let httpStatus: number | null = null;
  let textLength: number | null = null;
  try {
    const res = await fetchSource(s.url, s.fetchMode);
    httpStatus = res.status;
    if (!res.ok) throw new Error(res.error ?? `fetch failed (${res.status})`);
    if (s.kind === "page") {
      const r = await collectPage(db, runId, s, c, res.body, res.url);
      textLength = r.textLength;
      stats = { ok: true, newItems: r.newItems };
    } else {
      const r = await collectPosts(db, s, c, res.body, res.url);
      textLength = r.found;
      stats = { ok: true, newItems: r.newItems };
    }
    await db
      .update(source)
      .set({
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        lastError: null,
        baselinedAt: s.baselinedAt ?? new Date(),
        ...(stats.newItems > 0 ? { lastNewItemAt: new Date() } : {}),
      })
      .where(eq(source.id, s.id));
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    stats = { ok: false, newItems: 0, error: msg };
    await db
      .update(source)
      .set({ consecutiveFailures: s.consecutiveFailures + 1, lastError: msg })
      .where(eq(source.id, s.id));
  }
  await db.insert(sourceRun).values({
    runId, sourceId: s.id, ok: stats.ok, httpStatus, textLength, newItems: stats.newItems,
    error: stats.error ?? null, durationMs: Date.now() - started,
  });
  return stats;
}

/** Feeds and blog listings: a post is new when its canonical URL has never been seen. */
async function collectPosts(db: DB, s: Source, c: Competitor, body: string, finalUrl: string) {
  const entries =
    s.kind === "feed"
      ? await parseFeed(body, finalUrl)
      : extractListingLinks(body, finalUrl, s.linkPrefix ?? new URL(s.url).pathname).map((l) => ({ ...l, publishedAt: null as Date | null }));
  if (entries.length === 0) throw new Error("no posts found on the page; the layout may have changed");

  const keys = entries.map((e) => `post:${e.url}`);
  const existing = new Set(
    (await db.select({ k: item.dedupeKey }).from(item).where(inArray(item.dedupeKey, keys))).map((r) => r.k),
  );
  // Newest first, so the first-check backfill takes the latest posts. Listings keep page order.
  if (s.kind === "feed") entries.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  const fresh = entries.filter((e) => !existing.has(`post:${e.url}`));
  const firstCrawl = !s.baselinedAt;
  let newItems = 0;

  for (const [i, e] of fresh.entries()) {
    const base = {
      sourceId: s.id, competitorId: c.id, kind: "post" as const, url: e.url, title: e.title,
      publishedAt: e.publishedAt, dedupeKey: `post:${e.url}`, isCanary: isCanary(s),
    };
    const old = e.publishedAt && s.baselinedAt && e.publishedAt.getTime() < s.baselinedAt.getTime() - OLD_POST_DAYS * 864e5;
    // First check: the latest few posts are judged and labelled; everything older is silent history.
    const backfill = firstCrawl && i < config.backfillPosts;
    if ((firstCrawl && !backfill) || old || i >= config.maxPostsPerSourcePerRun) {
      await db.insert(item).values({
        ...base, text: "", status: "baseline",
        statusDetail: firstCrawl ? "present when monitoring started" : old ? "published before monitoring started" : "over the per-run limit; treated as backlog",
      }).onConflictDoNothing();
      continue;
    }
    const page = await fetchSource(e.url, s.fetchMode);
    if (!page.ok) {
      // A backfill post that can't be read becomes history; otherwise the next run would treat it as new.
      if (backfill) await db.insert(item).values({ ...base, text: "", status: "baseline", statusDetail: "present when monitoring started" }).onConflictDoNothing();
      continue; // a normal new post is retried next run, since no item row was written
    }
    const ex = extractMain(page.body, page.url);
    const inserted = await db.insert(item).values({
      // A listing link's text often runs the author, title, teaser and tags together, or is just "Read".
      // The post's own title is cleaner; a feed's title is already clean.
      ...base, title: (s.kind === "feed" ? e.title ?? ex.title : ex.title ?? e.title), publishedAt: e.publishedAt ?? ex.publishedAt,
      text: ex.text, status: "pending", isBackfill: backfill,
      statusDetail: backfill ? "published before monitoring started" : null,
    }).onConflictDoNothing().returning({ id: item.id });
    newItems += inserted.length;
  }
  return { newItems, found: entries.length };
}

/**
 * Watched pages: compare extracted main text with the last accepted snapshot.
 * Small changes do not move the baseline, so slow drift still adds up and is caught.
 */
async function collectPage(db: DB, runId: number, s: Source, c: Competitor, body: string, finalUrl: string) {
  const ex = extractMain(body, finalUrl, "page");
  if (ex.text.length < 100) throw new Error(`page text too short (${ex.text.length} chars); the page may be blocked or empty`);
  if (s.pageType === "pricing") return collectPricing(db, runId, s, c, ex);
  const norm = normalizeText(ex.text);
  const h = hash(norm);
  const [last] = await db.select().from(snapshot).where(eq(snapshot.sourceId, s.id)).orderBy(desc(snapshot.fetchedAt)).limit(1);

  if (!last) {
    await db.insert(snapshot).values({ sourceId: s.id, url: s.url, title: ex.title, text: ex.text, normalizedHash: h });
    return { newItems: 0, textLength: ex.text.length };
  }
  if (last.normalizedHash === h) return { newItems: 0, textLength: ex.text.length };

  const d = diffText(normalizeText(last.text), norm);
  if (d.size < config.minChangeChars) return { newItems: 0, textLength: ex.text.length };

  // Large drop in content usually means a redesign or a block, not a message change.
  if (ex.text.length < last.text.length * 0.4) {
    throw new Error(`page text shrank from ${last.text.length} to ${ex.text.length} chars; check the source before trusting changes`);
  }

  // Gate before moving the baseline: if the gate call fails, the next run sees the same change again.
  const gate = await gateChange(db, runId, {
    competitor: c.name, url: s.url, removed: d.removed.join("\n").slice(0, 6000), added: d.added.join("\n").slice(0, 6000),
  });
  await db.insert(snapshot).values({ sourceId: s.id, url: s.url, title: ex.title, text: ex.text, normalizedHash: h });
  const inserted = await db.insert(item).values({
    sourceId: s.id, competitorId: c.id, kind: "page_change", url: s.url,
    title: `${s.label} changed`, text: ex.text, beforeText: last.text, diff: formatDiff(d),
    gateReason: gate.reason, status: gate.meaningful ? "pending" : "cosmetic",
    dedupeKey: `page:${s.id}:${last.normalizedHash}:${h}`, isCanary: isCanary(s),
  }).onConflictDoNothing().returning({ id: item.id });
  return { newItems: gate.meaningful ? inserted.length : 0, textLength: ex.text.length };
}

/**
 * Pricing pages: the page is read into plans, prices and features, and compared field by field.
 * The model reads only when the text changed; code verifies every price and decides what changed.
 */
async function collectPricing(db: DB, runId: number, s: Source, c: Competitor, ex: { title: string | null; text: string }) {
  const h = hash(normalizeText(ex.text));
  const [last] = await db.select().from(snapshot).where(eq(snapshot.sourceId, s.id)).orderBy(desc(snapshot.fetchedAt)).limit(1);
  if (last && last.normalizedHash === h && last.structured) return { newItems: 0, textLength: ex.text.length };
  if (last && ex.text.length < last.text.length * 0.4) {
    throw new Error(`page text shrank from ${last.text.length} to ${ex.text.length} chars; check the source before trusting changes`);
  }

  const previous = (last?.structured as PricingSnapshot | null) ?? null;
  const reading = await extractPricing(db, runId, { competitor: c.name, url: s.url, text: ex.text, previous });
  const problems = verifyPricing(reading, ex.text);
  // An unverifiable reading never becomes a snapshot; the source fails visibly and the next run reads again.
  if (problems.length) throw new Error(`pricing reading not verified: ${problems.slice(0, 3).join("; ")}`);
  if (!reading.hasPricing) throw new Error("no plans found on the pricing page; it may have moved or need the headless browser");

  await db.insert(snapshot).values({ sourceId: s.id, url: s.url, title: ex.title, text: ex.text, normalizedHash: h, structured: reading });
  if (!last || !previous) return { newItems: 0, textLength: ex.text.length }; // first reading is the baseline

  const changes = diffPricing(previous, reading, last.text, ex.text);
  const inserted = await db.insert(item).values({
    sourceId: s.id, competitorId: c.id, kind: "page_change", url: s.url,
    title: `${s.label}: ${changes.length ? `${changes.length} pricing change${changes.length > 1 ? "s" : ""}` : "wording changed"}`,
    text: ex.text, beforeText: last.text, diff: changes.length ? formatPricingChanges(changes) : formatDiff(diffText(normalizeText(last.text), normalizeText(ex.text))),
    gateReason: changes.length ? "Plans, prices or features changed (compared field by field)" : "Text changed, but no plan, price or feature changed",
    status: changes.length ? "pending" : "cosmetic",
    dedupeKey: `page:${s.id}:${last.normalizedHash}:${h}`, isCanary: isCanary(s),
  }).onConflictDoNothing().returning({ id: item.id });
  return { newItems: changes.length ? inserted.length : 0, textLength: ex.text.length };
}

function isCanary(s: Source) {
  return /\/canary(\/|$)/.test(new URL(s.url).pathname);
}

export async function activeSources(db: DB) {
  return db
    .select({ s: source, c: competitor })
    .from(source)
    .innerJoin(competitor, eq(source.competitorId, competitor.id))
    .where(and(eq(source.active, true), eq(competitor.active, true)));
}
