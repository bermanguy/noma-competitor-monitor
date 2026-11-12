import { and, desc, eq } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, source, sourceRun } from "../db/schema";
import { localNow, sendOnce } from "./deliver";

export type Health = "healthy" | "failing" | "quiet" | "new";

/** Feeds and listings that published nothing for this long are suspicious: often a silent layout change. */
const QUIET_DAYS = 30;

export function sourceHealth(s: typeof source.$inferSelect, now = new Date()): { health: Health; reason: string } {
  if (!s.baselinedAt && s.consecutiveFailures === 0) return { health: "new", reason: "not crawled yet" };
  if (s.consecutiveFailures >= 2 || (!s.lastSuccessAt && s.consecutiveFailures >= 1)) {
    return { health: "failing", reason: s.lastError ?? "failing" };
  }
  if (s.kind !== "page") {
    const since = s.lastNewItemAt ?? s.baselinedAt;
    if (since && now.getTime() - since.getTime() > QUIET_DAYS * 864e5) {
      return { health: "quiet", reason: `no new posts for ${Math.round((now.getTime() - since.getTime()) / 864e5)} days` };
    }
  }
  return { health: "healthy", reason: s.consecutiveFailures === 1 ? `last attempt failed: ${s.lastError}` : "ok" };
}

/** Posts one ops alert per problem per day. Run-level problems (a crash, the budget, failed deliveries) come in from the run. */
export async function checkHealth(db: DB, runSummary: string, runProblems: string[] = []) {
  const { date } = localNow();
  const rows = await db.select({ s: source, c: competitor }).from(source).innerJoin(competitor, eq(source.competitorId, competitor.id)).where(eq(source.active, true));
  const problems: string[] = runProblems.map((p) => `• ${p}`);
  for (const { s, c } of rows) {
    const h = sourceHealth(s);
    if (h.health === "failing" || h.health === "quiet") {
      problems.push(`• *${c.name} · ${s.label}* is ${h.health}: ${h.reason}\n   ${s.url}`);
    }
    // A sharp drop in extracted text on a listing usually means the page was redesigned.
    if (s.kind !== "page") {
      const last = await db.select().from(sourceRun).where(and(eq(sourceRun.sourceId, s.id), eq(sourceRun.ok, true))).orderBy(desc(sourceRun.id)).limit(2);
      const [cur, prev] = last;
      if (cur?.textLength && prev?.textLength && cur.textLength < prev.textLength * 0.5) {
        problems.push(`• *${c.name} · ${s.label}*: posts found dropped from ${prev.textLength} to ${cur.textLength}. The layout may have changed.`);
      }
    }
  }
  if (problems.length === 0) return 0;
  const key = `ops:health:${date}:${problems.length}:${hashish(problems.join())}`;
  await sendOnce(db, key, { kind: "ops", teamKey: null, judgmentIds: [] }, config.opsWebhookEnv, {
    text: "Competitor monitor needs attention",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:warning: *Competitor monitor needs attention*\n${problems.join("\n")}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `${runSummary} · <${config.publicUrl}/ops/runs|Open the Builder area>` }] },
    ],
  });
  return problems.length;
}

function hashish(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** Tells an external monitor the run finished. If pings stop, that monitor alerts. */
export async function heartbeat(ok: boolean) {
  if (!config.heartbeatUrl) return;
  try {
    await fetch(ok ? config.heartbeatUrl : `${config.heartbeatUrl}/fail`, { method: "POST" });
  } catch (e) {
    console.error(`heartbeat failed: ${(e as Error).message}`);
  }
}
