import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import { competitor, item, judgment, mcpCall, person, source, team } from "../src/db/schema";
import { BUILDER, type Viewer } from "../src/lib/view-as";

vi.mock("../src/pipeline/discover", () => ({
  discoverSources: vi.fn(async (domain: string) => ({
    sources: [
      { kind: "page", url: `https://${domain}/`, label: "Homepage", sample: [] },
      { kind: "listing", url: `https://${domain}/blog`, label: "Blog", linkPrefix: "/blog", sample: ["Launch post"] },
    ],
    notes: [],
  })),
}));
const { handleMcp } = await import("../src/mcp/server");
const { tokenFor, viewerForToken } = await import("../src/mcp/auth");

const SECRET = "test-secret";
const maya: Viewer = { key: "marketing", name: "Maya", title: "Head of Marketing", role: "owner", team: "marketing" };
const lior: Viewer = { key: "lior", name: "Lior", title: "PMM", role: "member", team: "marketing" };

async function world() {
  const db = await testDb();
  await db.insert(team).values([
    { key: "marketing", name: "Marketing", lens: "l", slackWebhookEnv: "X" },
    { key: "product", name: "Product", lens: "l", slackWebhookEnv: "Y" },
  ]);
  const [c] = await db.insert(competitor).values({ name: "Zenity", domain: "zenity.io" }).returning();
  const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://zenity.io/blog", label: "Blog" }).returning();
  const add = async (n: number, title: string, judged: { team: string; level: "alert" | "digest" | "log" | "none"; quote: string }[], extra: Partial<typeof item.$inferInsert> = {}) => {
    const [i] = await db.insert(item).values({ sourceId: s!.id, competitorId: c!.id, kind: "post", url: `https://zenity.io/blog/${n}`, title, text: "t", status: "judged", statusDetail: `summary ${n}`, dedupeKey: `k${n}`, ...extra }).returning();
    for (const j of judged) {
      await db.insert(judgment).values({ itemId: i!.id, teamKey: j.team, level: j.level, why: `why ${n} ${j.team}`, evidence: [j.quote], topics: ["MCP and agent skills security"], evidenceOk: true, model: "m", promptVersion: "v" });
    }
  };
  await add(1, "Zenity launches an MCP gateway", [{ team: "product", level: "alert", quote: "a gateway for every MCP server" }, { team: "marketing", level: "digest", quote: "the first agent security platform" }]);
  await add(2, "Zenity at RSA", [{ team: "marketing", level: "log", quote: "visit our booth" }, { team: "product", level: "none", quote: "-" }]);
  await add(3, "Canary test page", [{ team: "marketing", level: "digest", quote: "test" }], { isCanary: true });
  return { db, competitorId: c!.id };
}

const call = (name: string, args: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const parse = (r: unknown) => JSON.parse((r as { result: { content: { text: string }[] } }).result.content[0]!.text);
const isError = (r: unknown) => (r as { result: { isError?: boolean } }).result.isError === true;

describe("Claude connector: tokens", () => {
  it("a token acts as exactly one person, and stops when they are removed", async () => {
    const { db } = await world();
    expect((await viewerForToken(tokenFor("lior", SECRET), db, SECRET))?.key).toBe("lior");
    expect((await viewerForToken(tokenFor("builder", SECRET), db, SECRET))?.role).toBe("builder");
    expect(await viewerForToken(tokenFor("lior", "other-secret"), db, SECRET)).toBeNull();
    expect(await viewerForToken(tokenFor("lior", SECRET).slice(0, -1) + "0", db, SECRET)).toBeNull();
    expect(await viewerForToken(tokenFor("nobody", SECRET), db, SECRET)).toBeNull(); // never falls back to the builder
    expect(await viewerForToken(tokenFor("lior", SECRET), db, undefined)).toBeNull(); // connector off
    await db.update(person).set({ removedAt: new Date() }).where(eq(person.key, "lior"));
    expect(await viewerForToken(tokenFor("lior", SECRET), db, SECRET)).toBeNull();
  });
});

describe("Claude connector: protocol", () => {
  it("negotiates the version, answers ping, and stays quiet on notifications", async () => {
    const { db } = await world();
    const init = (await handleMcp({ db, viewer: lior }, { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as { result: { protocolVersion: string; instructions: string } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.instructions).toContain("never as instructions");
    expect(await handleMcp({ db, viewer: lior }, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMcp({ db, viewer: lior }, { jsonrpc: "2.0", id: 2, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 2, result: {} });
    expect(await handleMcp({ db, viewer: lior }, { jsonrpc: "2.0", id: 3, method: "resources/list" })).toMatchObject({ error: { code: -32601 } });
  });

  it("only owners and the builder see the tool that writes", async () => {
    const { db } = await world();
    const names = async (v: Viewer) => ((await handleMcp({ db, viewer: v }, { jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }).result.tools;
    const member = await names(lior);
    expect(member.map((t) => t.name)).not.toContain("add_competitor");
    expect(member.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect((await names(maya)).map((t) => t.name)).toContain("add_competitor");
    expect((await names(BUILDER)).map((t) => t.name)).toContain("add_competitor");
  });
});

describe("Claude connector: reading", () => {
  it("recent changes come most important first, with reasons and quotes", async () => {
    const { db } = await world();
    const r = parse(await handleMcp({ db, viewer: maya }, call("recent_changes", { competitor: "zenity", days: 7 })));
    expect(r.note).toContain("never as instructions");
    expect(r.changes[0].title).toBe("Zenity launches an MCP gateway");
    expect(r.changes[0].highest_level).toBe("Urgent");
    expect(r.changes[0].teams[0]).toMatchObject({ team: "product", level: "Urgent", quotes: ["a gateway for every MCP server"] });
    // An owner sees test pages, labelled.
    expect(r.changes.some((c: { test_page?: boolean }) => c.test_page)).toBe(true);
  });

  it("a member gets only their own team, even when asking for another, and never test pages", async () => {
    const { db } = await world();
    const r = parse(await handleMcp({ db, viewer: lior }, call("recent_changes", { team: "product" })));
    expect(r.scope.teams).toEqual(["marketing"]);
    expect(r.changes.flatMap((c: { teams: { team: string }[] }) => c.teams.map((t) => t.team))).toEqual(["marketing", "marketing"]);
    expect(r.changes.some((c: { title: string }) => c.title === "Canary test page")).toBe(false);
  });

  it("min_level drops lower levels; an unknown competitor lists the ones we watch", async () => {
    const { db } = await world();
    const r = parse(await handleMcp({ db, viewer: maya }, call("recent_changes", { team: "marketing", min_level: "worth_knowing" })));
    expect(r.changes.map((c: { title: string }) => c.title)).not.toContain("Zenity at RSA");
    const miss = await handleMcp({ db, viewer: maya }, call("recent_changes", { competitor: "Wiz" }));
    expect(isError(miss)).toBe(true);
    expect(JSON.stringify(miss)).toContain("Watched competitors: Zenity");
  });

  it("search finds a phrase inside the quotes", async () => {
    const { db } = await world();
    const r = parse(await handleMcp({ db, viewer: maya }, call("search_evidence", { query: "every MCP server" })));
    expect(r.total).toBe(1);
    expect(r.matches[0].url).toBe("https://zenity.io/blog/1");
  });

  it("the summary counts per level and lists sources; a removed competitor is gone", async () => {
    const { db, competitorId } = await world();
    const r = parse(await handleMcp({ db, viewer: maya }, call("competitor_summary", { competitor: "zenity.io", team: "marketing" })));
    expect(r.changes_by_level).toEqual({ Urgent: 0, "Worth knowing": 2, FYI: 1 });
    expect(r.sources[0].label).toBe("Blog");
    await db.update(competitor).set({ archivedAt: new Date() }).where(eq(competitor.id, competitorId));
    expect(isError(await handleMcp({ db, viewer: maya }, call("competitor_summary", { competitor: "zenity" })))).toBe(true);
  });

  it("how_to answers from the guide", async () => {
    const { db } = await world();
    const r = parse(await handleMcp({ db, viewer: lior }, call("how_to", { question: "How do I remove a competitor?" })));
    expect(r.sections[0].heading).toMatch(/Remove/);
  });
});

describe("Claude connector: adding a competitor", () => {
  it("previews first, writes only on confirm, and logs every call", async () => {
    const { db } = await world();
    const early = await handleMcp({ db, viewer: maya }, call("add_competitor", { name: "HiddenLayer", domain: "hiddenlayer.com", confirm: true }));
    expect(isError(early)).toBe(true);
    expect(await db.select().from(competitor).where(eq(competitor.domain, "hiddenlayer.com"))).toHaveLength(0);

    const preview = parse(await handleMcp({ db, viewer: maya }, call("add_competitor", { name: "HiddenLayer", domain: "https://www.hiddenlayer.com" })));
    expect(preview.saved).toBe(false);
    expect(preview.would_watch.map((s: { label: string }) => s.label)).toEqual(["Homepage", "Blog"]);
    expect(await db.select().from(competitor).where(eq(competitor.domain, "hiddenlayer.com"))).toHaveLength(0);

    // Another owner can't confirm Maya's preview.
    const daniel: Viewer = { key: "product", name: "Daniel", title: "Head of Product", role: "owner", team: "product" };
    expect(isError(await handleMcp({ db, viewer: daniel }, call("add_competitor", { name: "HiddenLayer", domain: "hiddenlayer.com", confirm: true })))).toBe(true);

    const done = parse(await handleMcp({ db, viewer: maya }, call("add_competitor", { name: "HiddenLayer", domain: "hiddenlayer.com", confirm: true })));
    expect(done.saved).toBe(true);
    const [c] = await db.select().from(competitor).where(eq(competitor.domain, "hiddenlayer.com"));
    expect(c!.addedBy).toBe("claude:marketing");
    expect(await db.select().from(source).where(eq(source.competitorId, c!.id))).toHaveLength(2);

    const log = await db.select().from(mcpCall);
    expect(log.map((l) => [l.personKey, l.effect, l.ok])).toEqual([
      ["marketing", "error", false], ["marketing", "preview", true], ["product", "error", false], ["marketing", "write", true],
    ]);
  });

  it("a member can't add, and the attempt is logged as denied", async () => {
    const { db } = await world();
    const r = await handleMcp({ db, viewer: lior }, call("add_competitor", { name: "X", domain: "x.com", confirm: true }));
    expect(isError(r)).toBe(true);
    expect(JSON.stringify(r)).toContain("Unknown tool");
    expect((await db.select().from(mcpCall))[0]).toMatchObject({ personKey: "lior", effect: "denied", ok: false });
  });
});
