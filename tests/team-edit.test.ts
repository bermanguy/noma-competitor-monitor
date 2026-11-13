import { describe, expect, it } from "vitest";
import { editVerdict, verdictFor } from "../src/eval/team-edit";
import { scoreTeams, type Outcome } from "../src/eval/score";

const o = (id: string, team: string, expected: Outcome["expected"], got: Outcome["got"]): Outcome => ({ id, team, expected, got, evidenceOk: true });

describe("editVerdict: does an owner's edit make anything worse?", () => {
  const before = [o("straiker", "product", "digest", "alert"), o("pillar", "product", "digest", "digest"), o("vanta", "product", "alert", "alert"),
    o("straiker", "marketing", "digest", "digest"), o("lasso", "marketing", "log", "log"), o("hammer", "marketing", "digest", "digest")];

  it("goes live when only the target answer moves, toward the answer key", () => {
    const after = before.map((x) => (x.id === "straiker" && x.team === "product" ? { ...x, got: "digest" as const } : x));
    const v = editVerdict(after, before);
    expect(v.ok).toBe(true);
    expect(v.better.map((b) => `${b.id}/${b.team}`)).toEqual(["straiker/product"]);
    expect(v.worse).toEqual([]);
  });

  it("treats one answer one step worse as likely noise", () => {
    const after = before.map((x) => (x.id === "lasso" ? { ...x, got: "digest" as const } : x));
    const v = editVerdict(after, before);
    expect(v.ok).toBe(true);
    expect(v.worse).toHaveLength(1);
  });

  it("holds the edit back when another team gets two answers worse: Product's edit can't quietly hurt Marketing", () => {
    const after = before.map((x) => (x.team === "marketing" && x.id !== "straiker" ? { ...x, got: x.id === "lasso" ? "digest" as const : "log" as const } : x));
    const v = editVerdict(after, before);
    expect(v.ok).toBe(false);
    expect(v.blockingTeams).toEqual(["marketing"]);
  });

  it("holds the edit back on a new severe miss, even a single one", () => {
    const after = before.map((x) => (x.id === "vanta" ? { ...x, got: "log" as const } : x));
    const v = editVerdict(after, before);
    expect(v.ok).toBe(false);
    expect(v.worse[0]?.severe).toBe(true);
  });

  it("counts an owner's corrected answer without judging again", () => {
    const after = before.map((x) => (x.team === "marketing" && x.id !== "straiker" ? { ...x, got: x.id === "lasso" ? "digest" as const : "log" as const } : x));
    const run = (outcomes: Outcome[]) => ({ when: "", promptVersion: "", model: "", graded: 0, unlabelled: 0, scores: scoreTeams(outcomes), outcomes, failed: [], costUsd: 0 });
    expect(verdictFor(run(after), run(before), new Map()).ok).toBe(false);
    // Marketing's owner says the answer key was out of date for both posts.
    const answers = new Map([["lasso|marketing", "digest" as const], ["hammer|marketing", "log" as const]]);
    expect(verdictFor(run(after), run(before), answers).ok).toBe(true);
  });
});
