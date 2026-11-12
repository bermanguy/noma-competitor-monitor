import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";

const requoteReply = vi.fn();
vi.mock("../src/pipeline/judge", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/judge")>()),
  requote: (...a: unknown[]) => requoteReply(...a),
}));
const { settleEvidence } = await import("../src/pipeline/evidence");
const { quotesInSource } = await import("../src/pipeline/text");

const source = "Acme launched a gateway that inspects every tool call at runtime. Pricing starts at $89 a month.";
const result = (evidence: string[], level: "alert" | "digest" | "log" = "alert") => ({
  summary: "s", sameStoryAs: null, whatsNew: null,
  judgments: [{ team: "rnd", level, why: "w", evidence, topics: [] }],
});

describe("evidence", () => {
  it("drops a bad quote when a good one remains, without a retry", async () => {
    const db = await testDb();
    requoteReply.mockReset();
    const r = await settleEvidence(db, undefined, result(["inspects every tool call at runtime", "made-up words here"]), source);
    expect(r.judgments[0]!.evidence).toEqual(["inspects every tool call at runtime"]);
    expect(requoteReply).not.toHaveBeenCalled();
  });

  it("retries once for exact quotes and keeps the decision when they check out", async () => {
    const db = await testDb();
    requoteReply.mockReset().mockResolvedValue({ quotes: [{ team: "rnd", evidence: ["Pricing starts at $89 a month"] }] });
    const r = await settleEvidence(db, undefined, result(["a paraphrase of the post"]), source);
    expect(requoteReply).toHaveBeenCalledTimes(1);
    expect(quotesInSource(r.judgments[0]!.evidence, source)).toBe(true);
  });

  it("stays held when the retry also fails, and never retries for log", async () => {
    const db = await testDb();
    requoteReply.mockReset().mockRejectedValue(new Error("network"));
    const held = await settleEvidence(db, undefined, result(["a paraphrase of the post"]), source);
    expect(quotesInSource(held.judgments[0]!.evidence, source)).toBe(false);
    requoteReply.mockReset();
    await settleEvidence(db, undefined, result(["a paraphrase of the post"], "log"), source);
    expect(requoteReply).not.toHaveBeenCalled();
  });
});
