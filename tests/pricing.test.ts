import { describe, expect, it } from "vitest";
import { diffPricing, formatPricingChanges, occurrences, verifyPricing, type PricingSnapshot } from "../src/pipeline/pricing";

const plan = (name: string, monthly: string | null, yearly: string | null, features: string[]) => ({
  name,
  prices: [
    { billing: monthly ? ("monthly" as const) : ("custom" as const), amount: monthly, unit: monthly ? "per user / month" : "" },
    ...(yearly ? [{ billing: "yearly" as const, amount: yearly, unit: "per user / month, billed annually" }] : []),
  ],
  features,
});
const snap = (...plans: ReturnType<typeof plan>[]): PricingSnapshot => ({ hasPricing: true, plans });
const page = (s: PricingSnapshot) =>
  s.plans.map((p) => [p.name, ...p.prices.map((x) => `${x.amount ?? "Contact sales"} ${x.unit}`), ...p.features].join("\n")).join("\n");

const base = snap(
  plan("Starter", "$29", "$24", ["Up to 10 AI agents", "Email support"]),
  plan("Team", "$79", "$66", ["Up to 100 AI agents", "Runtime guardrails"]),
  plan("Enterprise", null, null, ["Unlimited AI agents", "SSO and SCIM"]),
);

describe("pricing skill", () => {
  it("reports nothing when the page reads the same", () => {
    expect(diffPricing(base, structuredClone(base), page(base), page(base))).toEqual([]);
  });

  it("reports a monthly price change, even though it is three characters", () => {
    const after = structuredClone(base);
    after.plans[1]!.prices[0]!.amount = "$89";
    const changes = diffPricing(base, after, page(base), page(after));
    expect(formatPricingChanges(changes)).toBe("Team (monthly): $79 per user / month → $89 per user / month");
  });

  it("reports a new plan and a feature moving between plans", () => {
    const after = structuredClone(base);
    after.plans[2]!.features = ["Unlimited AI agents"];
    after.plans[1]!.features.push("SSO and SCIM");
    after.plans.splice(1, 0, plan("Growth", "$49", "$41", ["Up to 40 AI agents"]));
    const text = formatPricingChanges(diffPricing(base, after, page(base), page(after)));
    expect(text).toContain("New plan: Growth");
    expect(text).toContain('"SSO and SCIM" moved from Enterprise to Team');
  });

  it("ignores a reading that differs while the page text did not", () => {
    // Same page, but the second reading dropped a feature and misread a plan name: not a change.
    const misread = structuredClone(base);
    misread.plans[0]!.features = ["Up to 10 AI agents"];
    misread.plans[1]!.name = "Teams";
    expect(diffPricing(base, misread, page(base), page(base))).toEqual([]);
  });

  it("rejects a reading with a price that is not on the page", () => {
    const bad = structuredClone(base);
    bad.plans[0]!.prices[0]!.amount = "$19";
    expect(verifyPricing(bad, page(base))).toEqual(['Starter monthly price "$19" is not on the page']);
    expect(verifyPricing(base, page(base))).toEqual([]);
  });

  it("matches whole amounts only", () => {
    expect(occurrences("$290 per year", "$29")).toBe(0);
    expect(occurrences("$29 per month, $29 again", "$29")).toBe(2);
  });
});
