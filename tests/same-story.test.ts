import { describe, expect, it, vi } from "vitest";
import type { SlackItem } from "../src/pipeline/slack";

const modelReply = vi.fn();
vi.mock("../src/pipeline/llm", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/llm")>()),
  structuredCall: (...a: unknown[]) => modelReply(...a),
}));
const { judgeItem, buildJudgeUser } = await import("../src/pipeline/judge");
const { groupStories, digestMessages, MAX_BLOCKS, digestRatingToken } = await import("../src/pipeline/slack");
const digestMessage = (t: string, items: SlackItem[]) => digestMessages(t, items)[0]!.payload;

const input = {
  competitor: "Acme", kind: "post" as const, url: "https://acme.test/p", title: "Press", publishedAt: null, text: "Acme disclosed research.",
  teams: [{ key: "rnd", name: "R&D", lens: "tech" }], company: "c", levels: "l", topics: [],
  earlier: [{ id: 7, title: "Research", publishedAt: "2026-10-08", summary: "Acme published research.", levels: { rnd: "alert" } }],
};

describe("same story", () => {
  it("shows earlier items to the judge and keeps only a link to an item it was shown", async () => {
    expect(buildJudgeUser(input)).toContain('<item id="7" published="2026-10-08">');
    modelReply.mockResolvedValueOnce({ summary: "s", sameStoryAs: 7, whatsNew: "Nothing", judgments: [{ team: "rnd", level: "log", why: "w", evidence: [], topics: [] }] });
    expect((await judgeItem({} as never, undefined, input)).sameStoryAs).toBe(7);
    modelReply.mockResolvedValueOnce({ summary: "s", sameStoryAs: 99, whatsNew: "x", judgments: [{ team: "rnd", level: "log", why: "w", evidence: [], topics: [] }] });
    expect(await judgeItem({} as never, undefined, input)).toMatchObject({ sameStoryAs: null, whatsNew: null });
  });

  it("judges each team in its own call that holds only that team's description", async () => {
    const two = { ...input, earlier: [], teams: [{ key: "rnd", name: "R&D", lens: "RND-LENS" }, { key: "product", name: "Product", lens: "PRODUCT-LENS" }] };
    const j = (team: string) => ({ team, level: "digest", why: "w", evidence: [], topics: [] });
    modelReply.mockReset();
    modelReply.mockResolvedValueOnce({ summary: "s", sameStoryAs: null, whatsNew: null, judgments: [j("R&D")] })
      // Product's first answer leaves its team out, so it is asked once more.
      .mockResolvedValueOnce({ summary: "s", sameStoryAs: null, whatsNew: null, judgments: [] })
      .mockResolvedValueOnce({ summary: "s", sameStoryAs: null, whatsNew: null, judgments: [j("Product")] });
    const r = await judgeItem({} as never, undefined, two);
    expect(modelReply).toHaveBeenCalledTimes(3);
    expect(r.judgments.map((x) => x.team)).toEqual(["rnd", "product"]);
    const prompts = modelReply.mock.calls.map((c) => ((c[0] as { user: string[] }).user).join("\n"));
    expect(prompts[0]).toContain("RND-LENS");
    expect(prompts[0]).not.toContain("PRODUCT-LENS");
    expect(prompts[2]).toContain("PRODUCT-LENS");
    expect(prompts[2]).not.toContain("RND-LENS");
    // The item text is the cached first part, the same for both teams.
    expect((modelReply.mock.calls[0]![0] as { user: string[] }).user[0]).toBe((modelReply.mock.calls[2]![0] as { user: string[] }).user[0]);
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
    const items: SlackItem[] = Array.from({ length: 60 }, (_, n) => ({
      judgmentId: n + 1, itemId: n + 1, competitor: "Acme", title: `t${n}`, url: `https://acme.test/${n}`, kind: "post", level: "digest",
      why: "w", evidence: ["one quote here", "a second quote"], publishedAt: null, isCanary: false,
    }));
    const parts = digestMessages("Product", items);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.payload.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(parts.flatMap((p) => p.judgmentIds)).toEqual(items.map((i) => i.judgmentId));
    expect(parts[1]!.payload.text).toBe(`Product digest: 60 · part 2 of ${parts.length}`);
    // A digest bullet is short: the quotes stay in alerts and the web feed.
    expect(JSON.stringify(parts[0]!.payload)).not.toContain("one quote here");
  });

  it("groups the digest by the owner's topics, in the owner's order, with the rest under Other", () => {
    const it = (judgmentId: number, topics: string[]): SlackItem => ({
      judgmentId, itemId: judgmentId, competitor: "Acme", title: `t${judgmentId}`, url: `https://acme.test/${judgmentId}`, kind: "post", level: "digest",
      why: `why ${judgmentId}`, evidence: [], publishedAt: null, isCanary: false, topics,
    });
    const [part] = digestMessages("Product", [it(1, []), it(2, ["MCP security"]), it(3, ["Gone topic", "Runtime security"]), it(4, ["Runtime security"])], ["Runtime security", "MCP security"]);
    const texts = part!.payload.blocks.map((b) => JSON.stringify(b));
    const at = (s: string) => texts.findIndex((t) => t.includes(s));
    expect(at("*Runtime security* (2)")).toBeLessThan(at("*MCP security* (1)"));
    expect(at("*MCP security* (1)")).toBeLessThan(at("*Other* (1)"));
    expect(at("why 3")).toBeLessThan(at("*MCP security*"));
    expect(texts.join()).toContain("Runtime security 2 · MCP security 1 · Other 1");
    const ids = [...part!.judgmentIds];
    expect([...ids].sort()).toEqual([1, 2, 3, 4]);
    // No vote links per line: one signed link at the bottom rates every update in this message.
    const all = texts.join();
    expect(all).not.toContain("useful=0");
    expect(texts.at(-1)).toContain(`ids=${ids.join(".")}&t=${digestRatingToken(ids)}|Rate these 4 updates`);
    expect(digestRatingToken([1, 2])).not.toBe(digestRatingToken([1, 2, 3]));
  });
});
