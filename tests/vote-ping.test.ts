import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { competitor, delivery, feedback, item, judgment, source, team } from "../src/db/schema";

process.env.SLACK_WEBHOOK_OWNER = "https://hooks.test/owner";
const posted: { env: string; payload: unknown }[] = [];
vi.mock("../src/pipeline/slack", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/slack")>()),
  postToSlack: vi.fn(async (env: string, payload: unknown) => { posted.push({ env, payload }); }),
}));
const { pingOwnerOfVote } = await import("../src/pipeline/vote-ping");

describe("a not-useful vote pings the team's owner", () => {
  it("names the owner, links to To review, sends once, and ignores useful votes", async () => {
    const db = await testDb();
    await db.insert(team).values({ key: "marketing", name: "Marketing", lens: "m", slackWebhookEnv: "X_marketing" });
    const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
    const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog" }).returning();
    const [i] = await db.insert(item).values({ sourceId: s!.id, competitorId: c!.id, kind: "post", url: "https://acme.test/p", title: "Voice agents", text: "t", status: "judged", dedupeKey: "k" }).returning();
    const [j] = await db.insert(judgment).values({ itemId: i!.id, teamKey: "marketing", level: "alert", why: "w", evidence: [], evidenceOk: true, model: "m", promptVersion: "v" }).returning();
    const [no] = await db.insert(feedback).values({ judgmentId: j!.id, useful: false, reason: "product news, not positioning" }).returning();
    const [yes] = await db.insert(feedback).values({ judgmentId: j!.id, useful: true }).returning();

    expect(await pingOwnerOfVote(db, no!.id)).toBe("sent");
    expect(await pingOwnerOfVote(db, no!.id)).toBe("skipped"); // never twice for one vote
    expect(await pingOwnerOfVote(db, yes!.id)).toBe("skipped");
    expect(posted).toHaveLength(1);
    const text = JSON.stringify(posted[0]!.payload);
    expect(posted[0]!.env).toBe("SLACK_WEBHOOK_OWNER");
    expect(text).toContain("Maya (Head of Marketing), please review");
    expect(text).toContain("/settings/review|Open To review");
    expect(text).toContain("product news, not positioning");
    expect((await db.select().from(delivery)).map((d) => d.kind)).toEqual(["owner"]);
  });
});
