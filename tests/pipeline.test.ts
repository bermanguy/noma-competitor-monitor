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
const pricingReply = vi.fn();
vi.mock("../src/pipeline/pricing", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/pricing")>()),
  extractPricing: (...a: unknown[]) => pricingReply(...a),
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
  web.clear(); posted.length = 0; judgeReply.mockReset(); gateReply.mockReset(); pricingReply.mockReset();
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

  it("judges the latest 3 posts on the first check as labelled backfill, sent only in the digest", async () => {
    const slugs = ["p1", "p2", "p3", "p4", "p5"];
    web.set("https://acme.test/blog", listing(slugs));
    for (const s of slugs) web.set(`https://acme.test/blog/${s}`, post(s));
    web.set("https://acme.test/", home("Tagline"));
    judgeReply.mockResolvedValue(judgment_("alert", "inspects every tool call at runtime"));
    await runPipeline(db, "test");
    const posts = await db.select().from(item).where(eq(item.kind, "post"));
    expect(posts.filter((i) => i.isBackfill).map((i) => i.url.split("/").pop()).sort()).toEqual(["p1", "p2", "p3"]);
    expect(posts.filter((i) => i.status === "baseline")).toHaveLength(2);
    expect(judgeReply).toHaveBeenCalledTimes(3);
    // "alert" from the judge is downgraded: no urgent posts, one digest per interested team.
    expect(posted.some((p) => p.payload.text.startsWith("Acme:"))).toBe(false);
    expect(posted.map((p) => p.env).sort()).toEqual(["SLACK_product", "SLACK_rnd"]);
    expect(JSON.stringify(posted[0]!.payload)).toContain("published before monitoring started");
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

  it("pricing pages: compares plans field by field, judges real changes, logs wording-only changes", async () => {
    const [c] = await db.select().from(competitor);
    await db.insert(source).values({ competitorId: c!.id, kind: "page", url: "https://acme.test/pricing", label: "Pricing", pageType: "pricing" });
    const pricingPage = (team: string, extra = "") =>
      `<html><body><main><h1>Pricing</h1>${para("Simple plans for every security team.")}<h2>Starter</h2><p>$29 per user / month</p><h2>Team</h2><p>${team} per user / month</p><p>${extra}</p></main></body></html>`;
    const reading = (team: string) => ({ hasPricing: true, plans: [
      { name: "Starter", prices: [{ billing: "monthly", amount: "$29", unit: "per user / month" }], features: [] },
      { name: "Team", prices: [{ billing: "monthly", amount: team, unit: "per user / month" }], features: [] },
    ] });
    web.set("https://acme.test/blog", listing(["a"]));
    web.set("https://acme.test/", home("Tagline"));
    web.set("https://acme.test/pricing", pricingPage("$79"));
    pricingReply.mockResolvedValue(reading("$79"));
    await runPipeline(db, "test");
    expect(await db.select().from(item).where(eq(item.kind, "page_change"))).toHaveLength(0);

    // Unchanged text: the page is not read again.
    await runPipeline(db, "test");
    expect(pricingReply).toHaveBeenCalledTimes(1);

    // A three-character price change is reported and judged, with no gate call.
    web.set("https://acme.test/pricing", pricingPage("$89"));
    pricingReply.mockResolvedValue(reading("$89"));
    judgeReply.mockResolvedValue(judgment_("alert", "$89 per user / month"));
    await runPipeline(db, "test");
    const [change] = await db.select().from(item).where(eq(item.kind, "page_change"));
    expect(change?.diff).toBe("Team (monthly): $79 per user / month → $89 per user / month");
    expect(change?.status).toBe("judged");
    expect(gateReply).not.toHaveBeenCalled();
    expect(String(judgeReply.mock.calls[0]?.[2]?.pageType)).toBe("pricing");

    // Wording changes but plans and prices don't: logged as cosmetic, not judged.
    web.set("https://acme.test/pricing", pricingPage("$89", "All prices exclude VAT and are shown in US dollars."));
    await runPipeline(db, "test");
    const changes = await db.select().from(item).where(eq(item.kind, "page_change"));
    expect(changes.map((x) => x.status).sort()).toEqual(["cosmetic", "judged"]);
    expect(judgeReply).toHaveBeenCalledTimes(1);
  });

  it("pricing pages: a reading with a price not on the page fails the source and stores nothing", async () => {
    const [c] = await db.select().from(competitor);
    await db.insert(source).values({ competitorId: c!.id, kind: "page", url: "https://acme.test/pricing", label: "Pricing", pageType: "pricing" });
    web.set("https://acme.test/blog", listing(["a"]));
    web.set("https://acme.test/", home("Tagline"));
    web.set("https://acme.test/pricing", `<html><body><main><h1>Pricing</h1>${para("Starter costs $29 per user per month for small teams.")}</main></body></html>`);
    pricingReply.mockResolvedValue({ hasPricing: true, plans: [{ name: "Starter", prices: [{ billing: "monthly", amount: "$19", unit: "" }], features: [] }] });
    await runPipeline(db, "test");
    const [s] = await db.select().from(source).where(eq(source.url, "https://acme.test/pricing"));
    expect(s?.lastError).toMatch(/not verified/);
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
