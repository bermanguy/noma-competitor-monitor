import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { competitor, item, judgment, source, team } from "../src/db/schema";

// The judge answers "digest" with the draft wording and "alert" with the current one.
vi.mock("../src/pipeline/judge", () => ({
  judgeItem: vi.fn(async (_db: unknown, _run: unknown, i: { teams: { key: string; lens: string }[] }) => ({
    judgments: i.teams.map((t) => ({ team: t.key, level: t.lens.includes("Worth knowing") ? "digest" : "alert", why: "w" })),
  })),
}));
const { pinnedChange, tryLens } = await import("../src/pipeline/preview");

async function world() {
  const db = await testDb();
  await db.insert(team).values([{ key: "product", name: "Product", lens: "Product cares about launches.", slackWebhookEnv: "Y" }]);
  const [c] = await db.insert(competitor).values({ name: "Straiker", domain: "straiker.ai" }).returning();
  const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://straiker.ai/blog", label: "Blog" }).returning();
  const ids: number[] = [];
  // The voted post is the oldest, so it would not be among the latest five.
  for (let n = 0; n < 7; n++) {
    const [i] = await db.insert(item).values({ sourceId: s!.id, competitorId: c!.id, kind: "post", url: `https://straiker.ai/blog/${n}`, title: n === 0 ? "Straiker EU & India Expansion" : `Post ${n}`, text: "t", status: "judged", dedupeKey: `k${n}`, firstSeenAt: new Date(Date.now() - (10 - n) * 864e5) }).returning();
    await db.insert(judgment).values({ itemId: i!.id, teamKey: "product", level: "alert", why: "w", evidence: ["q"], topics: [], evidenceOk: true, model: "m", promptVersion: "v" });
    ids.push(i!.id);
  }
  return { db, voted: ids[0]! };
}

describe("fixing the wording for one post", () => {
  it("pins the post with the level the team got", async () => {
    const { db, voted } = await world();
    expect(await pinnedChange(db, "product", voted)).toMatchObject({ competitor: "Straiker", title: "Straiker EU & India Expansion", level: "alert" });
    expect(await pinnedChange(db, "marketing", voted)).toBeNull();
  });

  it("tries the edit on just that post, even when it is not among the latest", async () => {
    const { db, voted } = await world();
    const latest = await tryLens(db, "product", "New regions are Worth knowing, not Urgent.");
    expect(latest.map((t) => t.itemId)).not.toContain(voted);
    const one = await tryLens(db, "product", "New regions are Worth knowing, not Urgent.", 5, voted);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ itemId: voted, before: { level: "alert" }, after: { level: "digest" } });
  });
});
