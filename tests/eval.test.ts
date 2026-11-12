import { describe, expect, it } from "vitest";
import { loadGolden } from "../src/eval/golden";
import { regressions, scoreTeams, type Outcome } from "../src/eval/score";

const o = (id: string, team: string, expected: Outcome["expected"], got: Outcome["got"], evidenceOk = true): Outcome => ({ id, team, expected, got, evidenceOk });

describe("eval scoring", () => {
  it("counts alert and digest as sent, and scores precision and recall per team", () => {
    const [m] = scoreTeams([
      o("a", "marketing", "alert", "digest"), // sent, should be sent: hit, wrong level
      o("b", "marketing", "none", "digest"), // sent, should not be: noise
      o("c", "marketing", "digest", "log"), // missed
      o("d", "marketing", "log", "log"),
    ]);
    expect(m).toMatchObject({ team: "marketing", graded: 4, precision: 0.5, recall: 0.5, exact: 1 });
  });

  it("treats a sent judgment without evidence as not sent, and flags it", () => {
    const [s] = scoreTeams([o("a", "rnd", "alert", "alert", false)]);
    expect(s!.recall).toBe(0);
    expect(s!.evidenceFailures).toEqual(["a"]);
    expect(s!.severe).toEqual(["a: expected alert, got alert"]);
  });

  it("flags a missed alert and an alert on something irrelevant as severe", () => {
    const [s] = scoreTeams([o("a", "product", "alert", "log"), o("b", "product", "none", "alert"), o("c", "product", "none", "digest")]);
    expect(s!.severe).toEqual(["a: expected alert, got log", "b: expected none, got alert"]);
  });

  it("blocks a precision drop but tolerates a small recall dip", () => {
    const base = scoreTeams([o("a", "rnd", "alert", "alert"), o("b", "rnd", "digest", "digest")]);
    const worse = scoreTeams([o("a", "rnd", "alert", "alert"), o("b", "rnd", "none", "digest")]);
    expect(regressions(worse, base)).toEqual(["rnd: precision 100% → 50%"]);
    expect(regressions(base, base)).toEqual([]);
    expect(regressions(base, null)).toEqual([]);
  });
});

describe("golden set", () => {
  it("loads, and every labelled item names a level for every team", () => {
    const items = loadGolden();
    expect(items.length).toBeGreaterThan(0);
    for (const g of items.filter((x) => x.expected)) expect(Object.keys(g.expected!).sort()).toEqual(["marketing", "product", "rnd"]);
  });
});
