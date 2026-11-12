import { and, eq, gte, inArray } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, delivery, item, judgment, team, type DeliveryKind } from "../db/schema";
import { plan } from "./route";
import { alertMessage, digestMessages, postToSlack, type SlackItem } from "./slack";

/** Local date and hour in the business time zone. */
export function localNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

/**
 * Sends once per key. The row is written before the post, so a crash can at worst skip a message,
 * never send it twice. A failed post deletes its row so the next run retries it.
 */
export async function sendOnce(
  db: DB,
  key: string,
  meta: { kind: DeliveryKind; teamKey: string | null; judgmentIds: number[] },
  webhookEnv: string,
  payload: unknown,
): Promise<"sent" | "skipped" | "failed"> {
  const claimed = await db.insert(delivery).values({ key, ...meta, status: "sending" }).onConflictDoNothing().returning({ id: delivery.id });
  if (claimed.length === 0) return "skipped";
  try {
    await postToSlack(webhookEnv, payload);
    await db.update(delivery).set({ status: "sent" }).where(eq(delivery.key, key));
    return "sent";
  } catch (e) {
    await db.delete(delivery).where(eq(delivery.key, key));
    console.error(`delivery ${key} failed: ${(e as Error).message}`);
    return "failed";
  }
}

async function slackItems(db: DB, ids: number[]): Promise<Map<number, SlackItem>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ j: judgment, i: item, c: competitor })
    .from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(inArray(judgment.id, ids));
  const relatedIds = [...new Set(rows.map((r) => r.i.relatedItemId).filter((x): x is number => x != null))];
  const related = new Map(
    (relatedIds.length ? await db.select({ id: item.id, title: item.title, url: item.url }).from(item).where(inArray(item.id, relatedIds)) : [])
      .map((r) => [r.id, { itemId: r.id, title: r.title ?? r.url, url: r.url }]),
  );
  return new Map(
    rows.map(({ j, i, c }) => [
      j.id,
      {
        judgmentId: j.id, competitor: c.name, title: i.title ?? i.url, url: i.url, kind: i.kind, level: j.level,
        why: j.why, evidence: j.evidence, publishedAt: i.publishedAt, isCanary: i.isCanary, isBackfill: i.isBackfill,
        itemId: i.id, related: i.relatedItemId != null ? related.get(i.relatedItemId) ?? null : null, storyNote: i.storyNote,
      },
    ]),
  );
}

export async function deliver(db: DB, now = new Date()) {
  const { date, hour } = localNow(now);
  const since = new Date(now.getTime() - 7 * 864e5);
  const teams = await db.select().from(team);
  const candidates = await db
    .select({ judgmentId: judgment.id, teamKey: judgment.teamKey, level: judgment.level, evidenceOk: judgment.evidenceOk, createdAt: judgment.createdAt, isBackfill: item.isBackfill })
    .from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .where(and(gte(judgment.createdAt, since), inArray(judgment.level, ["alert", "digest"])));

  const recent = await db.select().from(delivery).where(gte(delivery.createdAt, since));
  const alreadySent = new Set(recent.filter((d) => d.kind !== "ops").flatMap((d) => d.judgmentIds));
  const todayStart = new Date(now.getTime() - 24 * 3600e3);
  const alertsSentToday = new Map<string, number>();
  for (const d of recent) {
    if (d.kind === "alert" && d.teamKey && d.createdAt >= todayStart) {
      alertsSentToday.set(d.teamKey, (alertsSentToday.get(d.teamKey) ?? 0) + d.judgmentIds.length);
    }
  }

  const p = plan(candidates, teams, alreadySent, alertsSentToday);
  const items = await slackItems(db, [...[...p.alerts.values()].flat(), ...[...p.digest.values()].flat()]);
  const stats = { alerts: 0, digests: 0, failed: 0 };

  for (const t of teams) {
    for (const id of p.alerts.get(t.key) ?? []) {
      const it = items.get(id);
      if (!it) continue;
      const r = await sendOnce(db, `alert:${id}`, { kind: "alert", teamKey: t.key, judgmentIds: [id] }, t.slackWebhookEnv, alertMessage(t.name, it));
      if (r === "sent") stats.alerts++;
      if (r === "failed") stats.failed++;
    }
    const digestIds = p.digest.get(t.key) ?? [];
    if (hour >= config.digestHourLocal && digestIds.length > 0) {
      const list = digestIds.map((id) => items.get(id)).filter((x): x is SlackItem => !!x);
      const parts = digestMessages(t.name, list);
      for (const [n, part] of parts.entries()) {
        // The first part keeps the original key, so a digest already sent today is never repeated.
        const key = n === 0 ? `digest:${t.key}:${date}` : `digest:${t.key}:${date}:${n + 1}`;
        const r = await sendOnce(db, key, { kind: "digest", teamKey: t.key, judgmentIds: part.judgmentIds }, t.slackWebhookEnv, part.payload);
        if (r === "sent" && n === 0) stats.digests++;
        if (r === "failed") stats.failed++;
      }
    }
  }
  return stats;
}
