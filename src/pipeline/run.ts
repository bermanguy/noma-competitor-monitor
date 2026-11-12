import { and, eq, lt } from "drizzle-orm";
import type { DB } from "../db/client";
import { run } from "../db/schema";
import { assessPending } from "./assess";
import { activeSources, collectSource } from "./collect";
import { deliver } from "./deliver";
import { checkHealth, heartbeat } from "./health";

const STALE_MINUTES = 45;

/**
 * One scheduled run: collect every source, judge what is new, deliver, check health.
 * Each stage reads and writes the database, so a crash anywhere is picked up by the next run.
 */
export async function runPipeline(db: DB, trigger: string) {
  // A run left "running" for too long crashed; close it so it doesn't block forever.
  await db.update(run).set({ status: "failed", error: "abandoned", finishedAt: new Date() })
    .where(and(eq(run.status, "running"), lt(run.startedAt, new Date(Date.now() - STALE_MINUTES * 60e3))));
  const busy = await db.select({ id: run.id }).from(run).where(eq(run.status, "running")).limit(1);
  if (busy.length) {
    console.log(`run ${busy[0]!.id} still in progress; exiting`);
    return null;
  }
  const [r] = await db.insert(run).values({ status: "running", trigger }).returning();
  const runId = r!.id;
  const stats: Record<string, number> = { sources: 0, sourcesFailed: 0, newItems: 0, judged: 0, held: 0, alerts: 0, digests: 0, deliveryFailed: 0, healthProblems: 0 };
  let error: string | null = null;

  try {
    for (const { s, c } of await activeSources(db)) {
      const res = await collectSource(db, runId, s, c);
      stats.sources!++;
      if (!res.ok) stats.sourcesFailed!++;
      stats.newItems! += res.newItems;
    }
    const a = await assessPending(db, runId);
    stats.judged = a.judged;
    stats.held = a.held;
    if (a.stoppedForBudget) error = "budget reached; remaining items wait for the next run";
    const d = await deliver(db);
    stats.alerts = d.alerts;
    stats.digests = d.digests;
    stats.deliveryFailed = d.failed;
  } catch (e) {
    error = (e as Error).stack ?? String(e);
  }

  const summary = `Run ${runId}: ${stats.sources} sources (${stats.sourcesFailed} failed), ${stats.newItems} new, ${stats.judged} judged, ${stats.alerts} alerts, ${stats.digests} digests`;
  try {
    const runProblems = [
      ...(error ? [`This run hit a problem: ${error.split("\n")[0]}`] : []),
      ...(stats.deliveryFailed ? [`${stats.deliveryFailed} Slack deliveries failed. Check the team webhooks.`] : []),
    ];
    stats.healthProblems = await checkHealth(db, summary, runProblems);
  } catch (e) {
    error ??= (e as Error).message;
  }
  const status = error && stats.sources === 0 ? "failed" : error || stats.sourcesFailed || stats.deliveryFailed ? "partial" : "ok";
  await db.update(run).set({ status, stats, error, finishedAt: new Date() }).where(eq(run.id, runId));
  await heartbeat(status !== "failed");
  console.log(`${summary} -> ${status}${error ? ` (${error.split("\n")[0]})` : ""}`);
  return { runId, status, stats };
}
