import { describe, expect, it, vi } from "vitest";
import type { SlackItem } from "../src/pipeline/slack";

const modelReply = vi.fn();
vi.mock("../src/pipeline/llm", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/llm")>()),
  structuredCall: (...a: unknown[]) => modelReply(...a),
}));
const { judgeItem, buildJudgeUser } = await import("../src/pipeline/judge");
const { groupStories, digestMessages, MAX_BLOCKS } = await import("../src/pipeline/slack");
const digestMessage = (t: string, items: SlackItem[]) => digestMessages(t, items)[0]!.payload;

const input = {
  competitor: "Acme", kind: "post" as const, url: "https://acme.test/p", title: "Press", publishedAt: null, text: "Acme disclosed research.",
  teams: [{ key: "rnd", name: "R&D", lens: "tech" }], company: "c", levels: "l", topics: [],
  earlier: [{ id: 7, title: "Research", publishedAt: "2026-10-08", summary: "Acme published research.", levels: { rnd: "alert" } }],
};

describe("same story", () => {
  it("shows earlier items to the judge and keeps only a link to an item it was shown", async () => {
    expect(buildJudgeUser(input)).toContain('<item id="7" published="2026-10-08">');
    modelReply.mockResolvedValueOnce({ summary: "s", sameStoryAs: 7, whatsNew: "Nothing", judgments: [] });
    expect((await judgeItem({} as never, undefined, input)).sameStoryAs).toBe(7);
    modelReply.mockResolvedValueOnce({ summary: "s", sameStoryAs: 99, whatsNew: "x", judgments: [] });
    expect(await judgeItem({} as never, undefined, input)).toMatchObject({ sameStoryAs: null, whatsNew: null });
  });

  it("groups a story's posts in the digest, with the original first", () => {
    const it = (judgmentId: number, itemId: number, related: number | null): SlackItem => ({
      judgmentId, itemId, competitor: "Acme", title: `t${itemId}`, url: `https://acme.test/${itemId}`, kind: "post", level: "digest",
      why: "w", evidence: [], publishedAt: null, isCanary: false,
      related: related ? { itemId: related, title: `t${related}`, url: `https://acme.test/${related}` } : null, storyNote: related ? "Adds a quote." : null,
    });
    const groups = groupStories([it(1, 11, 10), it(2, 10, null), it(3, 12, null)]);
    expect(groups.map((g) => g.map((x) => x.itemId))).toEqual([[10, 11], [12]]);
    const msg = digestMessage("R&D", [it(1, 11, 10), it(2, 10, null), it(3, 12, null)]);
    expect(msg.text).toBe("R&D digest: 2 stories, 3 posts");
    expect(JSON.stringify(msg.blocks)).toContain("Same story: <https://acme.test/11|t11> · New: Adds a quote.");
    // A follow-up whose original was sent earlier says so.
    expect(JSON.stringify(digestMessage("R&D", [it(1, 11, 10)]).blocks)).toContain("Follow-up to <https://acme.test/10|t10>");
  });

  it("splits a long digest into parts under Slack's block limit and keeps every item", () => {
    const items: SlackItem[] = Array.from({ length: 40 }, (_, n) => ({
      judgmentId: n + 1, itemId: n + 1, competitor: "Acme", title: `t${n}`, url: `https://acme.test/${n}`, kind: "post", level: "digest",
      why: "w", evidence: ["one quote here", "a second quote"], publishedAt: null, isCanary: false,
    }));
    const parts = digestMessages("Product", items);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.payload.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(parts.flatMap((p) => p.judgmentIds)).toEqual(items.map((i) => i.judgmentId));
    expect(parts[1]!.payload.text).toBe(`Product digest: 40 · part 2 of ${parts.length}`);
    // A digest entry shows one quote; alerts keep all of them.
    expect(JSON.stringify(parts[0]!.payload)).not.toContain("a second quote");
  });
});
