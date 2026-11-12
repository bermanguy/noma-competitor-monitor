import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import { competitor, delivery, item, judgment, source, team, topic } from "../src/db/schema";
import type { DB } from "../src/db/client";

// The web, the model and Slack are replaced by fakes; everything else is the real pipeline on a real Postgres.
const web = new Map<string, string>();
vi.mock("../src/pipeline/fetch", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/fetch")>()),
  fetchSource: vi.fn(async (url: string) => {
    const body = web.get(url);
    return body === undefined
      ? { ok: false, status: 404, url, body: "", contentType: "", error: "http 404" }
      : { ok: true, status: 200, url, body, contentType: "text/html" };
  }),
}));
const judgeReply = vi.fn();
const gateReply = vi.fn();
vi.mock("../src/pipeline/judge", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/judge")>()),
  judgeItem: (...a: unknown[]) => judgeReply(...a),
  gateChange: (...a: unknown[]) => gateReply(...a),
}));
const posted: { env: string; payload: { text: string } }[] = [];
vi.mock("../src/pipeline/slack", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/slack")>()),
  postToSlack: vi.fn(async (env: string, payload: { text: string }) => { posted.push({ env, payload }); }),
}));

const { runPipeline } = await import("../src/pipeline/run");

const para = (s: string) => `<p>${s}</p>`.repeat(4);
const listing = (slugs: string[]) => `<html><body>${slugs.map((s) => `<a href="/blog/${s}">${s}</a>`).join("")}</body></html>`;
const post = (s: string) => `<html><body><article><h1>${s}</h1>${para(`Acme launched an MCP gateway called ${s} that inspects every tool call at runtime.`)}</article></body></html>`;
const home = (tagline: string) => `<html><body><main><h1>${tagline}</h1>${para("Discover, assess and protect every AI agent across the enterprise with one platform.")}</main></body></html>`;

let db: DB;
beforeEach(async () => {
  db = await testDb();
  web.clear(); posted.length = 0; judgeReply.mockReset(); gateReply.mockReset();
  for (const [key, name] of [["marketing", "Marketing"], ["product", "Product"], ["rnd", "R&D"]] as const) {
    await db.insert(team).values({ key, name, lens: `${name} lens`, slackWebhookEnv: `SLACK_${key}` });
  }
  await db.insert(topic).values({ name: "MCP security", description: "MCP", teamKeys: ["product", "rnd"] });
  const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
  await db.insert(source).values([
    { competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog", linkPrefix: "/blog" },
    { competitorId: c!.id, kind: "page", url: "https://acme.test/", label: "Homepage" },
  ]);
  process.env.DIGEST_HOUR_LOCAL = "0";
});

const judgment_ = (product: "alert" | "digest" | "none", quote: string) => ({
  summary: "Acme launched something.",
  judgments: [
    { team: "product", level: product, why: "New capability in our area.", evidence: [quote], topics: ["MCP security"] },
    { team: "rnd", level: "digest", why: "Technical approach to tool inspection.", evidence: [quote], topics: [] },
    { team: "marketing", level: "none", why: "No positioning change.", evidence: [], topics: [] },
  ],
});

describe("pipeline", () => {
  it("baselines the first crawl, then judges and delivers only what is new, exactly once", async () => {
    web.set("https://acme.test/blog", listing(["old-one", "old-two"]));
    web.set("https://acme.test/", home("The AI security platform"));
    await runPipeline(db, "test");
    expect((await db.select().from(item)).every((i) => i.status === "baseline")).toBe(true);
    expect(judgeReply).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);

    // A new post appears and the homepage tagline changes.
    web.set("https://acme.test/blog", listing(["old-one", "old-two", "gatekeeper"]));
    web.set("https://acme.test/blog/gatekeeper", post("Gatekeeper"));
    web.set("https://acme.test/", home("The agentic security platform for every enterprise AI agent"));
    gateReply.mockResolvedValue({ meaningful: true, reason: "Tagline changed from AI security to agentic security" });
    judgeReply.mockResolvedValue(judgment_("alert", "inspects every tool call at runtime"));
    // the homepage quote must come from the page, so give the page change its own reply
    judgeReply.mockResolvedValueOnce(judgment_("alert", "inspects every tool call at runtime"))
      .mockResolvedValueOnce(judgment_("digest", "The agentic security platform"));
    const r2 = await runPipeline(db, "test");
    expect(r2?.stats.newItems).toBe(2);
    expect(r2?.stats.judged).toBe(2);
    expect(posted.filter((p) => p.env === "SLACK_product" && /gatekeeper/i.test(p.payload.text))).toHaveLength(1);
    expect(posted.some((p) => p.env === "SLACK_marketing")).toBe(false);
    const digests = posted.filter((p) => p.payload.text.includes("digest"));
    expect(digests.map((d) => d.env).sort()).toEqual(["SLACK_product", "SLACK_rnd"]);

    // Nothing changes: nothing is sent again.
    const before = posted.length;
    await runPipeline(db, "test");
    expect(posted.length).toBe(before);
    expect((await db.select().from(delivery)).every((d) => d.status === "sent")).toBe(true);
  });

  it("holds back a judgment whose evidence is not in the source", async () => {
    web.set("https://acme.test/blog", listing(["a"]));
    web.set("https://acme.test/", home("Tagline"));
    await runPipeline(db, "test");
    web.set("https://acme.test/blog", listing(["a", "b"]));
    web.set("https://acme.test/blog/b", post("B"));
    judgeReply.mockResolvedValue(judgment_("alert", "Acme was acquired by a large vendor"));
    await runPipeline(db, "test");
    const js = await db.select().from(judgment).where(eq(judgment.teamKey, "product"));
    expect(js[0]?.evidenceOk).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it("logs cosmetic page changes without judging them", async () => {
    web.set("https://acme.test/blog", listing(["a"]));
    web.set("https://acme.test/", home("Tagline one"));
    await runPipeline(db, "test");
    web.set("https://acme.test/", home("Join us at the summit next week in Las Vegas, booth 42"));
    gateReply.mockResolvedValue({ meaningful: false, reason: "Event banner text" });
    await runPipeline(db, "test");
    const [change] = await db.select().from(item).where(eq(item.kind, "page_change"));
    expect(change?.status).toBe("cosmetic");
    expect(judgeReply).not.toHaveBeenCalled();
  });

  it("records a failing source without stopping the run", async () => {
    web.set("https://acme.test/", home("Tagline"));
    const r = await runPipeline(db, "test");
    expect(r?.stats.sourcesFailed).toBe(1);
    expect(r?.status).toBe("partial");
    const [blog] = await db.select().from(source).where(eq(source.kind, "listing"));
    expect(blog?.consecutiveFailures).toBe(1);
  });
});
