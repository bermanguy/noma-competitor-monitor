import { and, desc, eq, gte, sql } from "drizzle-orm";
import { config } from "@/config";
import type { DB } from "@/db/client";
import { delivery, feedback, judgment, run, source, usage } from "@/db/schema";
import { examState } from "@/eval/run";
import { sourceHealth } from "@/pipeline/health";

export type MetricStatus = "ok" | "warn" | "bad" | "none";
export type MetricGroup = "Availability" | "Reliability" | "AI quality" | "Cost";

/** One number on the Builder overview: what we measure, the target, where it comes from, and where to dig in. */
export interface Metric {
  key: string;
  group: MetricGroup;
  label: string;
  value: string;
  target: string;
  status: MetricStatus;
  detail: string;
  /** The table the number is computed from, so anyone can check it. */
  source: string;
  href: string;
}

const RUN_EVERY_HOURS = 3;
const DAY = 864e5;
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** At or above the target is ok; within the warn band below it is a warning; lower is bad. */
const grade = (x: number, target: number, warnBand: number): MetricStatus => (x >= target ? "ok" : x >= target - warnBand ? "warn" : "bad");

export async function computeMetrics(db: DB, now = new Date()): Promise<Metric[]> {
  const week = new Date(now.getTime() - 7 * DAY);
  const month30 = new Date(now.getTime() - 30 * DAY);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const runs = await db.select({ status: run.status, startedAt: run.startedAt }).from(run).where(gte(run.startedAt, week));
  const [first] = await db.select({ startedAt: run.startedAt }).from(run).orderBy(run.startedAt).limit(1);
  const finished = runs.filter((r) => r.status !== "running");
  const completed = finished.filter((r) => r.status === "ok" || r.status === "partial");
  const [lastGood] = await db.select({ at: run.finishedAt }).from(run).where(sql`${run.status} in ('ok','partial')`).orderBy(desc(run.startedAt)).limit(1);

  // Availability: completed runs against the 3-hour schedule over the last 7 days (or since the first run, if newer).
  const windowStart = first && first.startedAt > week ? first.startedAt : week;
  const expected = Math.max(1, Math.floor((now.getTime() - windowStart.getTime()) / (RUN_EVERY_HOURS * 36e5)));
  const availability = first ? Math.min(1, completed.length / expected) : null;
  const lastGoodHours = lastGood?.at ? (now.getTime() - lastGood.at.getTime()) / 36e5 : null;

  const success = finished.length ? finished.filter((r) => r.status === "ok").length / finished.length : null;

  const srcs = (await db.select().from(source).where(eq(source.active, true))).map((s) => sourceHealth(s, now).health).filter((h) => h !== "new");
  const coverage = srcs.length ? srcs.filter((h) => h === "healthy").length / srcs.length : null;

  const sends = await db.select({ status: delivery.status, error: delivery.error }).from(delivery).where(gte(delivery.createdAt, week));
  const delivered = sends.length ? sends.filter((d) => d.status === "sent").length / sends.length : null;

  const exam = await examState(db);
  const precisions = (exam.last?.scores ?? []).filter((s) => s.precision !== null);
  const worst = precisions.length ? precisions.reduce((a, b) => (b.precision! < a.precision! ? b : a)) : null;

  const [g] = await db.select({ ok: sql<number>`sum(case when ${judgment.evidenceOk} then 1 else 0 end)`, n: sql<number>`count(*)` })
    .from(judgment).where(gte(judgment.createdAt, month30));
  const grounded = Number(g?.n) ? Number(g!.ok) / Number(g!.n) : null;

  const [f] = await db.select({ up: sql<number>`sum(case when ${feedback.useful} then 1 else 0 end)`, n: sql<number>`count(*)` })
    .from(feedback).where(gte(feedback.createdAt, month30));
  const useful = Number(f?.n) ? Number(f!.up) / Number(f!.n) : null;

  const [m] = await db.select({ cost: sql<number>`coalesce(sum(${usage.costUsd}), 0)` }).from(usage).where(gte(usage.createdAt, monthStart));
  const [w] = await db.select({ cost: sql<number>`coalesce(sum(${usage.costUsd}), 0)` }).from(usage).where(and(gte(usage.createdAt, week), sql`${usage.runId} is not null`));
  const spent = Number(m?.cost ?? 0);
  const capShare = spent / config.budgetPerMonthUsd;
  const perRun = finished.length ? Number(w?.cost ?? 0) / finished.length : null;

  return [
    {
      key: "availability", group: "Availability", label: "Runs on schedule",
      value: availability === null ? "–" : pct(availability), target: "≥ 95% of 3-hour slots, 7 days",
      status: availability === null ? "none" : lastGoodHours !== null && lastGoodHours > 2 * RUN_EVERY_HOURS ? "bad" : grade(availability, 0.95, 0.1),
      detail: lastGoodHours === null ? "No completed run yet" : `${completed.length} of ${expected} expected · last completed ${lastGoodHours < 1 ? "under an hour" : `${Math.round(lastGoodHours)}h`} ago`,
      source: "run + healthchecks.io heartbeat", href: "/ops/runs",
    },
    {
      key: "success", group: "Reliability", label: "Clean runs",
      value: success === null ? "–" : pct(success), target: "≥ 90% ok, 7 days",
      status: success === null ? "none" : grade(success, 0.9, 0.15),
      detail: `${finished.filter((r) => r.status === "partial").length} partial · ${finished.filter((r) => r.status === "failed").length} failed of ${finished.length}`,
      source: "run.status", href: "/ops/runs",
    },
    {
      key: "coverage", group: "Reliability", label: "Healthy sources",
      value: coverage === null ? "–" : pct(coverage), target: "≥ 90% of active sources",
      status: coverage === null ? "none" : grade(coverage, 0.9, 0.1),
      detail: `${srcs.filter((h) => h === "failing").length} failing · ${srcs.filter((h) => h === "quiet").length} quiet of ${srcs.length}`,
      source: "source + source_run", href: "/ops/sources",
    },
    {
      key: "delivery", group: "Reliability", label: "Slack delivery",
      value: delivered === null ? "–" : pct(delivered), target: "≥ 99% sent, 7 days",
      status: delivered === null ? "none" : grade(delivered, 0.99, 0.04),
      detail: `${sends.filter((d) => d.status !== "sent").length} not sent of ${sends.length} posts`,
      source: "delivery.status", href: "/ops/errors",
    },
    {
      key: "precision", group: "AI quality", label: "Evals precision (lowest team)",
      value: worst ? pct(worst.precision!) : "–", target: "≥ 85% for every team",
      status: worst ? grade(worst.precision!, 0.85, 0.1) : "none",
      detail: worst ? `${worst.team} · recall ${worst.recall === null ? "n/a" : pct(worst.recall)} · ${exam.last!.graded} golden items${exam.regressions.length ? " · below baseline" : ""}` : "No exam run yet",
      source: "evals on the golden set", href: "/ops/evals",
    },
    {
      key: "grounding", group: "AI quality", label: "Quotes verified",
      value: grounded === null ? "–" : pct(grounded), target: "≥ 95% of judgments, 30 days",
      status: grounded === null ? "none" : grade(grounded, 0.95, 0.05),
      detail: grounded === null ? "No judgments yet" : `${Number(g!.n) - Number(g!.ok)} held back because a quote was not in the source`,
      source: "judgment.evidence_ok", href: "/ops/feedback",
    },
    {
      key: "useful", group: "AI quality", label: "Rated useful",
      value: useful === null ? "–" : pct(useful), target: "≥ 60% 👍, 30 days",
      status: useful === null ? "none" : grade(useful, 0.6, 0.15),
      detail: useful === null ? "No ratings yet" : `${Number(f!.n)} ratings from the teams`,
      source: "feedback.useful", href: "/ops/feedback",
    },
    {
      key: "cost", group: "Cost", label: "Model spend this month",
      value: `$${spent.toFixed(2)}`, target: `< 80% of the $${config.budgetPerMonthUsd} cap`,
      status: capShare < 0.8 ? "ok" : capShare < 1 ? "warn" : "bad",
      detail: `${pct(capShare)} of cap${perRun === null ? "" : ` · about $${perRun.toFixed(2)} a run (cap $${config.budgetPerRunUsd})`}`,
      source: "usage.cost_usd", href: "/ops/spend",
    },
  ];
}

export type RuleState = "active" | "draft";

/**
 * Alert rules, in the shape Grafana, Datadog and Better Stack share: a condition on a metric, how often it is
 * evaluated, how long it must hold before firing, a severity and a channel. "Active" rules run today
 * (in health.ts, run.ts, llm.ts and healthchecks.io); "draft" rules are proposed and not wired yet.
 */
export interface AlertRule {
  name: string;
  metric: string;
  condition: string;
  evaluate: string;
  pendingFor: string;
  severity: "critical" | "warning" | "info";
  notify: string;
  state: RuleState;
  where: string;
  runbook: string;
}

export const ALERT_RULES: AlertRule[] = [
  { name: "Missed run", metric: "availability", condition: "No heartbeat ping", evaluate: "Every 3h", pendingFor: "1h grace", severity: "critical", notify: "#competitors-ops", state: "active", where: "healthchecks.io", runbook: "/ops/runs" },
  { name: "Run crashed or hit a problem", metric: "success", condition: "run.error is set", evaluate: "Each run", pendingFor: "None", severity: "critical", notify: "#competitors-ops", state: "active", where: "run.ts", runbook: "/ops/runs" },
  { name: "Source failing", metric: "coverage", condition: "Fetch fails", evaluate: "Each run", pendingFor: "2 runs in a row", severity: "warning", notify: "#competitors-ops", state: "active", where: "health.ts", runbook: "/ops/sources" },
  { name: "Source went quiet", metric: "coverage", condition: "No new posts on a feed or listing", evaluate: "Each run", pendingFor: "30 days", severity: "warning", notify: "#competitors-ops", state: "active", where: "health.ts", runbook: "/ops/sources" },
  { name: "Page content shrank", metric: "coverage", condition: "Text length < 50% of the last good run", evaluate: "Each run", pendingFor: "None", severity: "warning", notify: "#competitors-ops", state: "active", where: "health.ts", runbook: "/ops/sources" },
  { name: "Slack delivery failed", metric: "delivery", condition: "Failed posts > 0", evaluate: "Each run", pendingFor: "None", severity: "critical", notify: "#competitors-ops", state: "active", where: "run.ts", runbook: "/ops/errors" },
  { name: "Budget cap reached", metric: "cost", condition: `Run ≥ $${config.budgetPerRunUsd} or month ≥ $${config.budgetPerMonthUsd}`, evaluate: "Before each model call", pendingFor: "None", severity: "critical", notify: "#competitors-ops; judging stops", state: "active", where: "llm.ts", runbook: "/ops/spend" },
  { name: "Availability below target", metric: "availability", condition: "Runs on schedule < 95%", evaluate: "Daily", pendingFor: "7-day window", severity: "warning", notify: "#competitors-ops", state: "draft", where: "", runbook: "/ops/runs" },
  { name: "Evals precision dropped", metric: "precision", condition: "Any team < 85% or below baseline", evaluate: "After each eval run", pendingFor: "None", severity: "critical", notify: "#competitors-ops; block prompt change", state: "draft", where: "", runbook: "/ops/evals" },
  { name: "Quotes not verified", metric: "grounding", condition: "Verified < 95%", evaluate: "Daily", pendingFor: "7-day window", severity: "warning", notify: "#competitors-ops", state: "draft", where: "", runbook: "/ops/feedback" },
  { name: "Teams find it less useful", metric: "useful", condition: "A team's 👍 < 60%", evaluate: "Weekly", pendingFor: "14 days, ≥ 10 ratings", severity: "info", notify: "Owners' channel", state: "draft", where: "", runbook: "/ops/feedback" },
  { name: "Spend approaching cap", metric: "cost", condition: "Month ≥ 80% of the cap", evaluate: "Each run", pendingFor: "None", severity: "warning", notify: "#competitors-ops", state: "draft", where: "", runbook: "/ops/spend" },
];
