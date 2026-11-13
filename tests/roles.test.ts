import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { competitor, delivery, item, judgment, person, source, team } from "../src/db/schema";
import { BUILDER, allowedPath, canEditTeam, canManagePeople, type Viewer } from "../src/lib/view-as";

vi.mock("../src/pipeline/judge", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/judge")>()),
  // The draft says to hear about launches right away; everything else keeps its level.
  judgeItem: vi.fn(async (_db: unknown, _run: unknown, i: { title: string; teams: { key: string; lens: string }[] }) => ({
    summary: "", sameStoryAs: null, whatsNew: null,
    judgments: [{ team: i.teams[0]!.key, level: /launch/.test(i.teams[0]!.lens) && /launch/i.test(i.title) ? "alert" : "digest", why: "w", evidence: [], topics: [] }],
  })),
}));
const { previewDigest, tryLens } = await import("../src/pipeline/preview");

const maya: Viewer = { key: "marketing", name: "Maya", title: "Head of Marketing", role: "owner", team: "marketing" };
const lior: Viewer = { key: "lior", name: "Lior", title: "PMM", role: "member", team: "marketing" };

describe("roles", () => {
  it("an owner manages only their own team; a member manages nothing; the builder manages all", () => {
    expect(canManagePeople(maya, "marketing")).toBe(true);
    expect(canManagePeople(maya, "product")).toBe(false);
    expect(canEditTeam(lior, "marketing")).toBe(false);
    expect(canManagePeople(BUILDER, "rnd")).toBe(true);
  });

  it("a member sees only the Changes feed, and an owner never the builder area", () => {
    expect(allowedPath(lior, "/settings/people")).toBe("/");
    expect(allowedPath(lior, "/?level=alert")).toBe("/?level=alert");
    expect(allowedPath(maya, "/ops/runs")).toBe("/");
    expect(allowedPath(maya, "/settings/preview")).toBe("/settings/preview");
    expect(allowedPath(BUILDER, "/ops/runs")).toBe("/ops/runs");
    expect(allowedPath(maya, "/ops/overview")).toBe("/");
  });

  it("starts with an owner and a member in each team", async () => {
    const db = await testDb();
    const rows = await db.select().from(person);
    for (const t of ["marketing", "product", "rnd"]) {
      expect(rows.filter((p) => p.teamKey === t).map((p) => p.role).sort()).toEqual(["member", "owner"]);
    }
  });
});

async function withItems() {
  const db = await testDb();
  await db.insert(team).values({ key: "marketing", name: "Marketing", lens: "Positioning and category language.", slackWebhookEnv: "X" });
  const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
  const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog" }).returning();
  const add = async (n: number, title: string, level: "alert" | "digest" | "log") => {
    const [i] = await db.insert(item).values({ sourceId: s!.id, competitorId: c!.id, kind: "post", url: `https://acme.test/${n}`, title, text: "t", status: "judged", dedupeKey: `k${n}` }).returning();
    const [j] = await db.insert(judgment).values({ itemId: i!.id, teamKey: "marketing", level, why: `why ${n}`, evidence: [], evidenceOk: true, model: "m", promptVersion: "v" }).returning();
    return j!;
  };
  return { db, add };
}

describe("preview next digest", () => {
  it("shows what is waiting, as the same Slack message the digest sends", async () => {
    const { db, add } = await withItems();
    await add(1, "Acme launches agents", "digest");
    await add(2, "Acme blog recap", "log");
    const p = await previewDigest(db, "marketing");
    expect(p.mode).toBe("next");
    expect(p.storyCount).toBe(1);
    const text = JSON.stringify(p.parts);
    expect(text).toContain("Marketing · competitor digest (1)");
    expect(text).toContain("Acme launches agents");
    expect(text).not.toContain("Acme blog recap");
  });

  it("shows the last digest when nothing is waiting", async () => {
    const { db, add } = await withItems();
    const j = await add(1, "Acme launches agents", "digest");
    await db.insert(delivery).values({ key: "digest:marketing:old", kind: "digest", teamKey: "marketing", judgmentIds: [j.id], status: "sent" });
    const p = await previewDigest(db, "marketing");
    expect(p.mode).toBe("last");
    expect(JSON.stringify(p.parts)).toContain("Acme launches agents");
  });

  it("tries a draft description on the latest changes without saving it", async () => {
    const { db, add } = await withItems();
    await add(1, "Acme launches agents", "digest");
    await add(2, "Acme blog recap", "digest");
    const trials = await tryLens(db, "marketing", "Tell us right away about every launch.");
    const moved = trials.filter((t) => t.after && t.after.level !== t.before.level);
    expect(trials).toHaveLength(2);
    expect(moved.map((t) => t.title)).toEqual(["Acme launches agents"]);
    const [t] = await db.select().from(team);
    expect(t!.lens).toBe("Positioning and category language.");
  });
});

describe("test pages stay out of the digest", () => {
  it("leaves canary items out of the next digest and skips a digest that would hold only them", async () => {
    const { db, add } = await withItems();
    const j = await add(1, "Canary: new agent feature", "digest");
    const { item: itemT } = await import("../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const [jj] = await db.select().from(judgment).where(eq(judgment.id, j.id));
    await db.update(itemT).set({ isCanary: true }).where(eq(itemT.id, jj!.itemId));
    const { planDelivery } = await import("../src/pipeline/deliver");
    expect((await planDelivery(db)).plan.digest.get("marketing") ?? []).toEqual([]);
    expect((await previewDigest(db, "marketing")).mode).toBe("empty");

    await add(2, "Acme launches agents", "digest");
    const p = await previewDigest(db, "marketing");
    expect(p.storyCount).toBe(1);
    expect(JSON.stringify(p.parts)).not.toContain("Canary");
  });

  it("still sends an urgent canary change on its own, so the chain is tested end to end", async () => {
    const { db, add } = await withItems();
    const j = await add(1, "Canary: pricing moved", "alert");
    const { item: itemT } = await import("../src/db/schema");
    const { eq } = await import("drizzle-orm");
    const [jj] = await db.select().from(judgment).where(eq(judgment.id, j.id));
    await db.update(itemT).set({ isCanary: true }).where(eq(itemT.id, jj!.itemId));
    const { planDelivery } = await import("../src/pipeline/deliver");
    expect((await planDelivery(db)).plan.alerts.get("marketing")).toEqual([j.id]);
  });
});
