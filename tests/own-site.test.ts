import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import { feedback, item, judgment, ownerSuggestion, ownerTextHistory, source, competitor, team, topic } from "../src/db/schema";
import type { DB } from "../src/db/client";

vi.hoisted(() => {
  process.env.OWN_SITE_PAGES = "https://own.test/platform";
  process.env.SLACK_WEBHOOK_OWNER = "https://hooks.test/owner";
});

// The web, the model and Slack are fakes; the rest is real on an in-memory Postgres.
let page = "";
vi.mock("../src/pipeline/fetch", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/fetch")>()),
  fetchSource: vi.fn(async (url: string) => ({ ok: true, status: 200, url, body: page, contentType: "text/html" })),
}));
const modelReply = vi.fn();
vi.mock("../src/pipeline/llm", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/llm")>()),
  structuredCall: (...a: unknown[]) => modelReply(...a),
}));
const posted: { env: string; payload: unknown }[] = [];
vi.mock("../src/pipeline/slack", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/slack")>()),
  postToSlack: vi.fn(async (env: string, payload: unknown) => { posted.push({ env, payload }); }),
}));

const { checkOwnSite, applySuggestion, dismissSuggestion, feedbackNotes } = await import("../src/pipeline/own-site");
const { getOwnerTexts, restoreOwnerText } = await import("../src/lib/owner-text");

const para = (s: string) => `<p>${s}</p>`.repeat(3);
const html = (extra: string) => `<html><body><main><h1>The platform</h1>${para("Discover, assess and protect every AI agent across endpoint, SaaS and cloud with one platform.")}${extra}</main></body></html>`;
const draft = (over: Partial<Record<string, unknown>> = {}) => ({
  relevant: true,
  whatChanged: 'A new product, "Agent Firewall", was added to the platform page.',
  company: "Noma sells one platform for AI agent security: discovery, posture, runtime protection, access control, red teaming, and now Agent Firewall.",
  newTopics: [{ name: "Agent firewalls", description: "Inline blocking of agent traffic", teamKeys: ["product", "rnd", "nobody"] }],
  changedTopics: [],
  ...over,
});

let db: DB;
beforeEach(async () => {
  db = await testDb();
  posted.length = 0; modelReply.mockReset();
  for (const [key, name] of [["marketing", "Marketing"], ["product", "Product"], ["rnd", "R&D"]] as const) {
    await db.insert(team).values({ key, name, lens: `${name} lens`, slackWebhookEnv: `SLACK_${key}` });
  }
  await db.insert(topic).values({ name: "MCP security", description: "MCP", teamKeys: ["product", "rnd"] });
});

describe("Noma's own site", () => {
  it("baselines silently, then drafts one suggestion and tells the owner when the page really changes", async () => {
    page = html("");
    expect((await checkOwnSite(db)).suggestions).toBe(0);
    expect(modelReply).not.toHaveBeenCalled();

    // Unchanged page: nothing happens.
    await checkOwnSite(db);
    expect(modelReply).not.toHaveBeenCalled();

    page = html(para("Agent Firewall blocks unsafe agent actions inline, before they reach your systems."));
    modelReply.mockResolvedValue(draft());
    expect((await checkOwnSite(db)).suggestions).toBe(1);
    const [s] = await db.select().from(ownerSuggestion);
    expect(s).toMatchObject({ status: "pending", pageUrl: "https://own.test/platform" });
    expect(s!.newTopics).toEqual([{ name: "Agent firewalls", description: "Inline blocking of agent traffic", teamKeys: ["product", "rnd"] }]);
    expect(posted.map((p) => p.env)).toEqual(["SLACK_WEBHOOK_OWNER"]);
  });

  it("changes nothing until the owner approves, then keeps the old profile for undo", async () => {
    page = html("");
    await checkOwnSite(db);
    page = html(para("Agent Firewall blocks unsafe agent actions inline, before they reach your systems."));
    modelReply.mockResolvedValue(draft());
    await checkOwnSite(db);
    const before = (await getOwnerTexts(db)).company;
    const [s] = await db.select().from(ownerSuggestion);
    expect((await getOwnerTexts(db)).company).toBe(before);

    await applySuggestion(db, s!.id, { company: "Edited by the owner: Noma sells AI agent security, including Agent Firewall.", topicNames: ["Agent firewalls"] });
    expect((await getOwnerTexts(db)).company).toBe("Edited by the owner: Noma sells AI agent security, including Agent Firewall.");
    expect((await db.select().from(topic)).map((t) => t.name)).toContain("Agent firewalls");
    const [h] = await db.select().from(ownerTextHistory);
    expect(h).toMatchObject({ key: "owner:company", value: before, replacedBy: "suggestion" });

    await restoreOwnerText(db, h!.id);
    expect((await getOwnerTexts(db)).company).toBe(before);
    expect(await applySuggestion(db, s!.id, { company: null, topicNames: [] })).toBe(false); // already handled
  });

  it("ignores a change the model judges irrelevant, and a dismissed suggestion changes nothing", async () => {
    page = html("");
    await checkOwnSite(db);
    page = html(para("Join us at our booth at the AI Security Summit in Berlin on 3 December 2026."));
    modelReply.mockResolvedValue(draft({ relevant: false }));
    expect((await checkOwnSite(db)).suggestions).toBe(0);
    expect(posted).toHaveLength(0);

    page = html(para("Agent Firewall blocks unsafe agent actions inline, before they reach your systems."));
    modelReply.mockResolvedValue(draft());
    await checkOwnSite(db);
    const [s] = await db.select().from(ownerSuggestion);
    await dismissSuggestion(db, s!.id);
    expect((await db.select().from(ownerSuggestion).where(eq(ownerSuggestion.id, s!.id)))[0]!.status).toBe("dismissed");
    expect((await db.select().from(topic)).map((t) => t.name)).not.toContain("Agent firewalls");
  });

  it("tells the owner once a week when a team marks most items not useful", async () => {
    const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
    const [src] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog" }).returning();
    for (let n = 0; n < 6; n++) {
      const [i] = await db.insert(item).values({ sourceId: src!.id, competitorId: c!.id, kind: "post", url: `https://acme.test/blog/${n}`, text: "x", status: "judged", dedupeKey: `k${n}` }).returning();
      const [j] = await db.insert(judgment).values({ itemId: i!.id, teamKey: "marketing", level: "digest", why: "w", evidence: [], topics: [], evidenceOk: true, model: "m", promptVersion: "v" }).returning();
      await db.insert(feedback).values({ judgmentId: j!.id, useful: n === 0, reason: n === 1 ? "Too technical for us" : null });
    }
    expect(await feedbackNotes(db)).toBe(1);
    expect(JSON.stringify(posted[0]!.payload)).toContain("Marketing marked 5 of 6 items not useful");
    expect(await feedbackNotes(db)).toBe(0); // once a week
  });
});
