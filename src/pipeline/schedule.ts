import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { run } from "../db/schema";
import { localNow } from "./deliver";

/** Full runs happen every 3 hours on Israel time (00, 03, 06, 09...), so the 09:00 run carries the daily digest. */
export const RUN_EVERY_HOURS = 3;
/** If runs were missed (for example the scheduler fires at other hours), run anyway after this long. */
const CATCH_UP_HOURS = 3.5;

/**
 * The scheduler fires every hour; this decides whether this hour is a run hour in the business time zone.
 * Working in local time keeps the digest at 09:00 through daylight-saving changes, which a UTC cron cannot.
 */
export function isRunHour(now: Date, lastScheduledRun: Date | null): boolean {
  if (localNow(now).hour % RUN_EVERY_HOURS === 0) return true;
  return !lastScheduledRun || now.getTime() - lastScheduledRun.getTime() > CATCH_UP_HOURS * 3600e3;
}

export async function shouldRunNow(db: DB, now = new Date()): Promise<boolean> {
  const [last] = await db.select({ at: run.startedAt }).from(run).where(eq(run.trigger, "schedule")).orderBy(desc(run.id)).limit(1);
  return isRunHour(now, last?.at ?? null);
}
