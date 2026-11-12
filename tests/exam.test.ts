import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { team } from "../src/db/schema";
import type { GoldenItem } from "../src/eval/golden";

const judgeReply = vi.fn();
const requoteReply = vi.fn(async (..._a: unknown[]) => ({ quotes: [{ team: "rnd", evidence: ["still not in the text at all"] }] }));
vi.mock("../src/pipeline/judge", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/judge")>()),
  judgeItem: (...a: unknown[]) => judgeReply(...a),
  requote: (...a: unknown[]) => requoteReply(...a),
}));
const { runEval, examState, saveBaseline } = await import("../src/eval/run");

const g = (id: string, expected: GoldenItem["expected"]): GoldenItem => ({
  id, origin: "authored", competitor: "Acme", kind: "post", pageType: "general", url: `https://acme.test/${id}`, title: id,
  publishedAt: null, text: "Acme launched a gateway that inspects every tool call at runtime.", diff: null, beforeText: null,
  expected, labelledBy: "draft", note: "", tags: [], earlier: [],
});

describe("exam", () => {
  it("grades the judge per team, counts a missing quote as not sent, and skips unlabelled items", async () => {
    const db = await testDb();
    for (const [key, name] of [["marketing", "Marketing"], ["rnd", "R&D"]] as const) await db.insert(team).values({ key, name, lens: name, slackWebhookEnv: `X_${key}` });
    judgeReply.mockResolvedValue({ summary: "s", judgments: [
      { team: "marketing", level: "alert", why: "w", evidence: ["inspects every tool call at runtime"], topics: [] },
      { team: "rnd", level: "digest", why: "w", evidence: ["a quote that is not in the text"], topics: [] },
    ] });
    const r = await runEval(db, { items: [g("a", { marketing: "alert", rnd: "digest" }), g("b", null)] });
    expect(r.graded).toBe(1);
    expect(r.unlabelled).toBe(1);
    expect(r.scores.find((s) => s.team === "marketing")).toMatchObject({ precision: 1, recall: 1 });
    expect(r.scores.find((s) => s.team === "rnd")).toMatchObject({ recall: 0, evidenceFailures: ["a"] });
    expect(r.outcomes.find((o) => o.team === "rnd")?.why).toBe("w");
    expect(judgeReply).toHaveBeenCalledTimes(1);
  });

  it("checks that a repeated story is linked to the earlier item", async () => {
    const db = await testDb();
    await db.insert(team).values({ key: "rnd", name: "R&D", lens: "R&D", slackWebhookEnv: "X_rnd" });
    judgeReply.mockResolvedValue({ summary: "s", sameStoryAs: null, whatsNew: null, judgments: [{ team: "rnd", level: "log", why: "w", evidence: [], topics: [] }] });
    const item = { ...g("c", { rnd: "log" }), expectedSameStoryAs: 101 };
    const r = await runEval(db, { items: [item, g("d", { rnd: "log" })] });
    expect(r.stories).toEqual([{ id: "c", expected: 101, got: null, whatsNew: null }]);
  });

  it("compares the last exam with the saved baseline", async () => {
    const { setting } = await import("../src/db/schema");
    const db = await testDb();
    const result = (precision: number) => ({ when: new Date().toISOString(), promptVersion: "v", model: "m", graded: 1, unlabelled: 0, outcomes: [], failed: [], costUsd: 0,
      scores: [{ team: "rnd", graded: 1, precision, recall: 1, exact: 1, severe: [], evidenceFailures: [] }] });
    await db.insert(setting).values({ key: "eval:last", value: JSON.stringify(result(1)) });
    await saveBaseline(db);
    expect((await examState(db)).regressions).toEqual([]);
    const { eq } = await import("drizzle-orm");
    await db.update(setting).set({ value: JSON.stringify(result(0.5)) }).where(eq(setting.key, "eval:last"));
    expect((await examState(db)).regressions).toEqual(["rnd: precision 100% → 50%"]);
  });
});
