import { describe, expect, it } from "vitest";
import { compareRuns, scoreTeams, type Outcome } from "../src/eval/score";

const o = (id: string, team: string, expected: Outcome["expected"], got: Outcome["got"]): Outcome => ({ id, team, expected, got, evidenceOk: true });
const run = (when: string, outcomes: Outcome[]) => ({ when, outcomes, scores: scoreTeams(outcomes) });

describe("compareRuns", () => {
  const base = run("2026-11-12T17:07:00Z", [o("a", "rnd", "digest", "digest"), o("b", "rnd", "log", "log"), o("a", "product", "alert", "log")]);

  it("says when there is no baseline, and when the run is the baseline", () => {
    expect(compareRuns(base, null).verdict).toBe("no-baseline");
    expect(compareRuns(base, base).verdict).toBe("baseline");
  });

  it("lists answers that moved and items new since the baseline, and calls a drop and a gain mixed", () => {
    const last = run("2026-11-13T11:48:00Z", [o("a", "rnd", "digest", "digest"), o("b", "rnd", "log", "digest"), o("a", "product", "alert", "alert"), o("c", "rnd", "none", "log")]);
    const r = compareRuns(last, base);
    expect(r.verdict).toBe("mixed");
    expect(r.answers.map((x) => `${x.id}/${x.team}:${x.before}->${x.after}`)).toEqual(["b/rnd:log->digest", "a/product:log->alert"]);
    expect(r.newItems).toEqual(["c"]);
    expect(r.changes.find((c) => c.team === "rnd" && c.metric === "precision")!.delta).toBe(-50);
  });
});
