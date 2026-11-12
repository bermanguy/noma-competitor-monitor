/** Settings from the environment. Secrets are set in the Render dashboard, never committed. */
export const config = {
  judgeModel: process.env.JUDGE_MODEL ?? "claude-opus-5-5",
  gateModel: process.env.GATE_MODEL ?? "claude-haiku-5-5",
  /** Reads a pricing page into plans, prices and features. Runs only when the page text changed. */
  pricingModel: process.env.PRICING_MODEL ?? "claude-sonnet-5-5",
  budgetPerRunUsd: Number(process.env.BUDGET_PER_RUN_USD ?? 3),
  budgetPerMonthUsd: Number(process.env.BUDGET_PER_MONTH_USD ?? 40),
  minChangeChars: Number(process.env.MIN_CHANGE_CHARS ?? 40),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 20000),
  /** On a post source's first check, the latest N posts are judged (labelled) so a new competitor shows value on day one. */
  backfillPosts: Number(process.env.BACKFILL_POSTS ?? 3),
  maxPostsPerSourcePerRun: Number(process.env.MAX_POSTS_PER_SOURCE_PER_RUN ?? 10),
  /** The digest goes with the first run at or after this local hour. Runs are every 3 hours UTC, so in Israel: 08:00 in winter, 09:00 in summer. */
  digestHourLocal: Number(process.env.DIGEST_HOUR_LOCAL ?? 8),
  timezone: process.env.APP_TIMEZONE ?? "Asia/Jerusalem",
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  heartbeatUrl: process.env.HEARTBEAT_URL,
  opsWebhookEnv: "SLACK_WEBHOOK_OPS",
  browserExecutable: process.env.BROWSER_EXECUTABLE,
  userAgent:
    process.env.FETCH_USER_AGENT ??
    "Mozilla/5.0 (compatible; CompetitorMonitor/1.0; +public-content-monitoring)",
};

/** USD per million tokens, input / output. Update when prices change. */
export const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

export function costUsd(model: string, input: number, output: number): number {
  const [i, o] = PRICES[model] ?? [4, 20];
  return (input * i + output * o) / 1_000_000;
}
