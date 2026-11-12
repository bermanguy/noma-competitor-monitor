import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { config, costUsd } from "../config";
import type { DB } from "../db/client";
import { usage } from "../db/schema";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 3, timeout: 120_000 }));

export class BudgetExceeded extends Error {}
export class Refused extends Error {}

/** Spend so far this calendar month and in this run. */
export async function spend(db: DB, runId?: number) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const total = sql<number>`coalesce(sum(${usage.costUsd}),0)`;
  const [m] = await db.select({ s: total }).from(usage).where(gte(usage.createdAt, monthStart));
  let r = 0;
  if (runId) {
    const [x] = await db.select({ s: total }).from(usage).where(eq(usage.runId, runId));
    r = Number(x?.s ?? 0);
  }
  return { month: Number(m?.s ?? 0), run: r };
}

export interface CallOpts<S extends z.ZodType> {
  db: DB;
  runId?: number;
  purpose: string;
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}

/**
 * One structured call. Checks the budget first, records usage after, and refuses to
 * return anything that did not parse against the schema.
 */
export async function structuredCall<S extends z.ZodType>(o: CallOpts<S>): Promise<z.infer<S>> {
  const s = await spend(o.db, o.runId);
  if (s.month >= config.budgetPerMonthUsd) throw new BudgetExceeded(`monthly budget $${config.budgetPerMonthUsd} reached`);
  if (o.runId && s.run >= config.budgetPerRunUsd) throw new BudgetExceeded(`run budget $${config.budgetPerRunUsd} reached`);

  // Haiku has no server-side fallback; Opus and Sonnet re-run on a fallback model if a safety classifier declines.
  const fallback = o.model.startsWith("claude-haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  const res = await anthropic().beta.messages.parse({
    model: o.model,
    max_tokens: o.maxTokens ?? 4000,
    system: o.system,
    messages: [{ role: "user", content: o.user }],
    output_config: { format: betaZodOutputFormat(o.schema), effort: "medium" },
    ...fallback,
  });

  await o.db.insert(usage).values({
    runId: o.runId ?? null,
    purpose: o.purpose,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    costUsd: costUsd(res.model, res.usage.input_tokens, res.usage.output_tokens),
  });

  if (res.stop_reason === "refusal") throw new Refused(`model declined (${res.stop_details?.category ?? "unknown"})`);
  if (!res.parsed_output) throw new Error(`no parseable output (stop_reason ${res.stop_reason})`);
  return res.parsed_output as z.infer<S>;
}
