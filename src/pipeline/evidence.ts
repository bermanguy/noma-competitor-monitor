import type { DB } from "../db/client";
import { requote, type JudgeResult } from "./judge";
import { BudgetExceeded } from "./llm";
import { quotesInSource } from "./text";

const sent = (level: string) => level === "alert" || level === "digest";

/**
 * "No quote, no send" stays the rule, but a correct decision is not lost to one bad quote:
 * quotes that are not in the source are dropped, and a sent judgment left with none gets one
 * retry that asks only for exact quotes. If that fails too, the judgment is held as before.
 */
export async function settleEvidence(db: DB, runId: number | undefined, result: JudgeResult, sourceText: string, model?: string): Promise<JudgeResult> {
  const keep = (qs: string[]) => qs.filter((q) => quotesInSource([q], sourceText));
  const judgments = result.judgments.map((j) => (sent(j.level) ? { ...j, evidence: keep(j.evidence).length ? keep(j.evidence) : j.evidence } : j));
  const asks = judgments.filter((j) => sent(j.level) && !quotesInSource(j.evidence, sourceText));
  if (asks.length === 0) return { ...result, judgments };
  try {
    const r = await requote(db, runId, { source: sourceText, asks: asks.map((a) => ({ team: a.team, level: a.level, why: a.why })) }, model);
    for (const j of judgments) {
      const fresh = keep(r.quotes.find((q) => q.team === j.team)?.evidence ?? []);
      if (asks.includes(j) && fresh.length) j.evidence = fresh;
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) throw e;
    // The retry is a bonus; if it fails the judgment is simply held, as it was before.
  }
  return { ...result, judgments };
}
