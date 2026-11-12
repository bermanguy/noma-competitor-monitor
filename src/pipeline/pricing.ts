import { z } from "zod";
import { config } from "../config";
import type { DB } from "../db/client";
import { PRICING_SYSTEM } from "../prompts/scaffold";
import { structuredCall } from "./llm";

/**
 * The pricing page skill.
 * 1. A model reads the page into plans, prices per billing period, and features (only when the page text changed).
 * 2. Code verifies every price appears on the page, so an invented number never becomes a snapshot.
 * 3. Code compares the new snapshot with the last one, plan by plan, and reports only changes the page text backs up.
 * No size threshold applies here: "$29" becoming "$34" is three characters and the most important change on the page.
 */

export const Price = z.object({
  billing: z.enum(["monthly", "yearly", "one_time", "usage", "custom"]).describe("Billing period this price applies to; custom = contact sales"),
  amount: z.string().nullable().describe('The price exactly as written on the page, e.g. "$29" or "€1,200"; null when no number is shown'),
  unit: z.string().describe('What the price is per, as written, e.g. "per user / month, billed annually"; empty if none'),
});
export const Plan = z.object({
  name: z.string().describe("Plan name exactly as written"),
  prices: z.array(Price),
  features: z.array(z.string()).describe("Features or limits listed for this plan, each copied exactly from the page"),
});
export const PricingSnapshot = z.object({
  hasPricing: z.boolean().describe("False if the page shows no plans at all"),
  plans: z.array(Plan),
});
export type PricingSnapshot = z.infer<typeof PricingSnapshot>;

export async function extractPricing(
  db: DB, runId: number | undefined,
  args: { competitor: string; url: string; text: string; previous?: PricingSnapshot | null },
) {
  // The previous reading anchors names and wording, so an unchanged plan reads the same way twice.
  const prev = args.previous ? `\n<previous_reading>\n${JSON.stringify(args.previous)}\n</previous_reading>` : "";
  const user = `Competitor: ${args.competitor}\nPage: ${args.url}${prev}\n<page>\n${args.text.slice(0, 40000)}\n</page>`;
  return structuredCall({
    db, runId, purpose: "pricing", model: config.pricingModel, system: PRICING_SYSTEM, user, schema: PricingSnapshot, maxTokens: 6000,
  });
}

/** Lowercase, punctuation-insensitive form used to match names and features across readings. */
export const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9$€£¥%.]+/g, " ").replace(/\s+/g, " ").trim();
/** Prices compared as written, ignoring thousands separators and a space after the currency sign. */
const amountKey = (s: string) => s.toLowerCase().replace(/(\d),(\d)/g, "$1$2").replace(/([$€£¥])\s+(\d)/g, "$1$2").replace(/\s+/g, " ").trim();

/** Every price amount must appear on the page; anything else means the reading cannot be trusted. */
export function verifyPricing(p: PricingSnapshot, text: string): string[] {
  const flat = amountKey(text);
  const problems: string[] = [];
  for (const plan of p.plans) {
    for (const pr of plan.prices) {
      if (pr.amount && occurrences(flat, amountKey(pr.amount)) === 0) problems.push(`${plan.name} ${pr.billing} price "${pr.amount}" is not on the page`);
    }
  }
  return problems;
}

export type PricingChange =
  | { type: "plan_added" | "plan_removed"; plan: string }
  | { type: "price_changed"; plan: string; billing: string; before: string; after: string }
  | { type: "price_added" | "price_removed"; plan: string; billing: string; price: string }
  | { type: "feature_added" | "feature_removed"; plan: string; feature: string }
  | { type: "feature_moved"; feature: string; from: string; to: string };

const priceText = (p: z.infer<typeof Price>) => [p.amount ?? "contact sales", p.unit].filter(Boolean).join(" ");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** How often a phrase occurs in a text, matching whole words (so "$29" does not match "$290"). */
export function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return (haystack.match(new RegExp(`(?<![a-z0-9])${esc(needle)}(?![a-z0-9])`, "g")) ?? []).length;
}

/**
 * Plan-by-plan comparison. Two readings of the same page can differ slightly, so a change is reported
 * only when the page text backs it up: the phrase must occur more often (added) or less often (removed)
 * than before. A feature that leaves one plan and joins another is reported as a move, since a reading
 * error would not produce both sides.
 */
export function diffPricing(before: PricingSnapshot, after: PricingSnapshot, beforeText: string, afterText: string): PricingChange[] {
  const oldT = key(beforeText);
  const newT = key(afterText);
  const oldA = amountKey(beforeText);
  const newA = amountKey(afterText);
  const more = (k: string) => occurrences(newT, k) > occurrences(oldT, k);
  const fewer = (k: string) => occurrences(newT, k) < occurrences(oldT, k);
  const amountMoved = (o: string | null, n: string | null) =>
    (!!n && occurrences(newA, amountKey(n)) > occurrences(oldA, amountKey(n))) ||
    (!!o && occurrences(newA, amountKey(o)) < occurrences(oldA, amountKey(o)));

  const oldPlans = new Map(before.plans.map((p) => [key(p.name), p]));
  const newPlans = new Map(after.plans.map((p) => [key(p.name), p]));
  const out: PricingChange[] = [];

  for (const [k, p] of newPlans) if (!oldPlans.has(k) && more(k)) out.push({ type: "plan_added", plan: p.name });
  for (const [k, p] of oldPlans) if (!newPlans.has(k) && fewer(k)) out.push({ type: "plan_removed", plan: p.name });

  const added: { plan: string; feature: string; k: string }[] = [];
  const removed: { plan: string; feature: string; k: string }[] = [];
  for (const [k, np] of newPlans) {
    const op = oldPlans.get(k);
    if (!op) continue;
    const oldPrices = new Map(op.prices.map((x) => [x.billing, x]));
    const newPrices = new Map(np.prices.map((x) => [x.billing, x]));
    for (const [b, n] of newPrices) {
      const o = oldPrices.get(b);
      if (!o) {
        if (!n.amount || amountMoved(null, n.amount)) out.push({ type: "price_added", plan: np.name, billing: b, price: priceText(n) });
      } else if (amountKey(o.amount ?? "") !== amountKey(n.amount ?? "") && amountMoved(o.amount, n.amount)) {
        out.push({ type: "price_changed", plan: np.name, billing: b, before: priceText(o), after: priceText(n) });
      } else if (amountKey(o.amount ?? "") === amountKey(n.amount ?? "") && key(o.unit) !== key(n.unit) && (more(key(n.unit)) || fewer(key(o.unit)))) {
        out.push({ type: "price_changed", plan: np.name, billing: b, before: priceText(o), after: priceText(n) });
      }
    }
    for (const [b, o] of oldPrices) {
      if (!newPrices.has(b) && (!o.amount || amountMoved(o.amount, null))) out.push({ type: "price_removed", plan: np.name, billing: b, price: priceText(o) });
    }

    const of = new Set(op.features.map(key));
    const nf = new Set(np.features.map(key));
    for (const f of np.features) if (!of.has(key(f))) added.push({ plan: np.name, feature: f, k: key(f) });
    for (const f of op.features) if (!nf.has(key(f))) removed.push({ plan: np.name, feature: f, k: key(f) });
  }

  const moved = new Set<string>();
  for (const r of removed) {
    const a = added.find((x) => x.k === r.k && x.plan !== r.plan);
    if (a) { out.push({ type: "feature_moved", feature: a.feature, from: r.plan, to: a.plan }); moved.add(r.k); }
  }
  for (const a of added) if (!moved.has(a.k) && more(a.k)) out.push({ type: "feature_added", plan: a.plan, feature: a.feature });
  for (const r of removed) if (!moved.has(r.k) && fewer(r.k)) out.push({ type: "feature_removed", plan: r.plan, feature: r.feature });
  return out;
}

export function formatPricingChanges(changes: PricingChange[]): string {
  return changes.map((c) => {
    switch (c.type) {
      case "plan_added": return `New plan: ${c.plan}`;
      case "plan_removed": return `Plan removed: ${c.plan}`;
      case "price_changed": return `${c.plan} (${c.billing}): ${c.before} → ${c.after}`;
      case "price_added": return `${c.plan}: new ${c.billing} price ${c.price}`;
      case "price_removed": return `${c.plan}: ${c.billing} price removed (was ${c.price})`;
      case "feature_added": return `${c.plan}: added "${c.feature}"`;
      case "feature_removed": return `${c.plan}: removed "${c.feature}"`;
      case "feature_moved": return `"${c.feature}" moved from ${c.from} to ${c.to}`;
    }
  }).join("\n");
}
