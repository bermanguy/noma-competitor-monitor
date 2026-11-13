import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { EvalResult } from "../src/eval/run";
import type { Outcome } from "../src/eval/score";

// The judge is replaced: Marketing's draft gets everything right, and any team judged would come out
// wrong. Only Marketing should be judged, so R&D and Product must keep their baseline answers.
const runEval = vi.fn(async (_db: unknown, opts: { teams?: string[]; lens?: { teamKey: string } }) => {
  const teams = opts.teams ?? ["marketing", "product", "rnd"];
  const outcomes: Outcome[] = teams.flatMap((team) => ["a", "b", "c"].map((id) => ({
    id, team, expected: "digest" as const, got: (opts.lens && team === opts.lens.teamKey ? "digest" : "none") as Outcome["got"], evidenceOk: true,
  })));
  return { when: new Date().toISOString(), promptVersion: "judge-v6", model: "m", graded: 3, unlabelled: 0, scores: [], outcomes, failed: [], costUsd: 0 } satisfies EvalResult;
});
vi.mock("../src/eval/run", async (orig) => ({ ...(await orig<typeof import("../src/eval/run")>()), runEval }));
const { startEditCheck, getEdit } = await import("../src/eval/team-edit");
const { setBaseline } = await import("../src/eval/run");
const { scoreTeams } = await import("../src/eval/score");

describe("an owner's edit is checked on their own team only", () => {
  it("judges only the edited team and carries every other team's answers over from the baseline", async () => {
    const db = await testDb();
    const { team } = await import("../src/db/schema");
    await db.insert(team).values({ key: "marketing", name: "Marketing", lens: "Positioning and category language.", slackWebhookEnv: "X" });
    const outcomes: Outcome[] = ["marketing", "product", "rnd"].flatMap((team) => ["a", "b", "c"].map((id) => ({
      id, team, expected: "digest" as const, got: (team === "marketing" ? "log" : "digest") as Outcome["got"], evidenceOk: true,
    })));
    await setBaseline(db, { when: "2026-11-13T00:00:00Z", promptVersion: "judge-v6", model: "m", graded: 3, unlabelled: 0, scores: scoreTeams(outcomes), outcomes, failed: [], costUsd: 0 });
    const r = await startEditCheck(db, "marketing", "Every launch matters to Marketing, and so do category claims.", "Maya");
    expect(r).toHaveProperty("id");
    let e = await getEdit(db, (r as { id: number }).id);
    for (let n = 0; n < 50 && e?.status === "checking"; n++) { await new Promise((ok) => setTimeout(ok, 20)); e = await getEdit(db, (r as { id: number }).id); }
    expect(runEval).toHaveBeenCalledTimes(1);
    expect(runEval.mock.calls[0]![1]).toMatchObject({ teams: ["marketing"] });
    expect(e?.status).toBe("saved");
    const result = e!.result as EvalResult;
    expect(result.outcomes.filter((o) => o.team !== "marketing")).toEqual(outcomes.filter((o) => o.team !== "marketing"));
  });
});
