import { eq } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { setting } from "../db/schema";
import { sendOnce } from "../pipeline/deliver";
import { claimRunner, examState, releaseRunner, runEval, setLast } from "./run";
import { regressions } from "./score";

const KEY = "eval:weekly";
const WEEK = 7 * 864e5;

/**
 * Once a week the scheduled run also runs the evals, with nobody pressing anything. It catches drift
 * that no edit caused, such as a model update. The ops channel hears about it only if a team got worse
 * than the baseline; the baseline itself is never moved by this run.
 */
export async function weeklyEval(db: DB, now = new Date()): Promise<"skipped" | "ok" | "worse"> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY));
  if (row && now.getTime() - new Date(row.value).getTime() < WEEK) return "skipped";
  if (!(await claimRunner(db))) return "skipped";
  try {
    await db.insert(setting).values({ key: KEY, value: now.toISOString() }).onConflictDoUpdate({ target: setting.key, set: { value: now.toISOString(), updatedAt: now } });
    const r = await runEval(db);
    await setLast(db, r);
    const worse = regressions(r.scores, (await examState(db)).baseline?.scores ?? null);
    if (worse.length && process.env[config.opsWebhookEnv]) {
      await sendOnce(db, `weekly-eval:${now.toISOString().slice(0, 10)}`, { kind: "ops", teamKey: null, judgmentIds: [] }, config.opsWebhookEnv, {
        text: "The weekly evals found a team worse than the baseline",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `:warning: *The weekly evals found a team worse than the baseline.* Nothing changed in Setup, so this is likely the model or the sources.\n${worse.map((w) => `• ${w}`).join("\n")}\n<${config.publicUrl}/ops/evals|See what changed>` } }],
      });
    }
    return worse.length ? "worse" : "ok";
  } finally {
    await releaseRunner(db);
  }
}
