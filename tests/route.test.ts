import { describe, expect, it } from "vitest";
import { plan, type Candidate } from "../src/pipeline/route";

const t = (k: string, noise: "quiet" | "normal" = "normal", cap = 2) => ({ key: k, noise, dailyAlertCap: cap });
const c = (id: number, teamKey: string, level: Candidate["level"], evidenceOk = true): Candidate => ({ judgmentId: id, teamKey, level, evidenceOk, createdAt: new Date(id * 1000) });

describe("plan", () => {
  it("sends alerts now and digest items later", () => {
    const p = plan([c(1, "product", "alert"), c(2, "product", "digest"), c(3, "product", "log")], [t("product")], new Set(), new Map());
    expect(p.alerts.get("product")).toEqual([1]);
    expect(p.digest.get("product")).toEqual([2]);
  });
  it("never sends judgments that failed the evidence check", () => {
    const p = plan([c(1, "rnd", "alert", false)], [t("rnd")], new Set(), new Map());
    expect(p.alerts.size + p.digest.size).toBe(0);
  });
  it("moves alerts over the daily cap into the digest", () => {
    const p = plan([c(1, "mkt", "alert"), c(2, "mkt", "alert"), c(3, "mkt", "alert")], [t("mkt", "normal", 2)], new Set(), new Map([["mkt", 1]]));
    expect(p.alerts.get("mkt")).toEqual([1]);
    expect(p.digest.get("mkt")).toEqual([2, 3]);
  });
  it("quiet teams get alerts only", () => {
    const p = plan([c(1, "mkt", "digest"), c(2, "mkt", "alert")], [t("mkt", "quiet")], new Set(), new Map());
    expect(p.alerts.get("mkt")).toEqual([2]);
    expect(p.digest.get("mkt")).toBeUndefined();
  });
  it("never sends backfill as an alert, and quiet teams don't get it", () => {
    const b = { ...c(1, "product", "alert"), isBackfill: true };
    expect(plan([b], [t("product")], new Set(), new Map()).digest.get("product")).toEqual([1]);
    expect(plan([b], [t("product")], new Set(), new Map()).alerts.size).toBe(0);
    expect(plan([b], [t("product", "quiet")], new Set(), new Map()).digest.size).toBe(0);
  });
  it("skips what was already sent", () => {
    const p = plan([c(1, "rnd", "alert")], [t("rnd")], new Set([1]), new Map());
    expect(p.alerts.size).toBe(0);
  });
});
