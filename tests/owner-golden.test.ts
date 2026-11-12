import { describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { competitor, feedback, item, judgment, source, team } from "../src/db/schema";
import type { DB } from "../src/db/client";

const judgeReply = vi.fn();
vi.mock("../src/pipeline/judge", async (orig) => ({
  ...(await orig<typeof import("../src/pipeline/judge")>()),
  judgeItem: (...a: unknown[]) => judgeReply(...a),
}));
const { addToExam, examItems, ownerGolden, toReview } = await import("../src/eval/owner-golden");
const { runEval } = await import("../src/eval/run");
const { formatReport, ownerItemResults } = await import("../src/eval/score");

async function setup(db: DB) {
  for (const [key, name] of [["marketing", "Marketing"], ["rnd", "R&D"]] as const) await db.insert(team).values({ key, name, lens: name, slackWebhookEnv: `X_${key}` });
  const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
  const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog" }).returning();
  const [i] = await db.insert(item).values({
    sourceId: s!.id, competitorId: c!.id, kind: "post", url: "https://acme.test/blog/webinar", title: "Join our webinar",
    text: "Acme hosts a webinar next week about its company culture and hiring.", status: "judged", dedupeKey: "k1",
  }).returning();
  const [jm] = await db.insert(judgment).values({ itemId: i!.id, teamKey: "marketing", level: "digest", why: "Competitor marketing activity", evidence: ["hosts a webinar"], evidenceOk: true, model: "m", promptVersion: "v" }).returning();
  await db.insert(judgment).values({ itemId: i!.id, teamKey: "rnd", level: "none", why: "Not technical", evidence: [], evidenceOk: true, model: "m", promptVersion: "v" });
  await db.insert(feedback).values({ judgmentId: jm!.id, useful: false, reason: "a webinar about hiring is noise" });
  return i!.id;
}

describe("not-useful votes become exam items", () => {
  it("lists the vote for review with the judge's levels, then drops it once added", async () => {
    const db = await testDb();
    const itemId = await setup(db);
    const [r] = await toReview(db);
    expect(r).toMatchObject({ itemId, title: "Join our webinar", levels: { marketing: "digest", rnd: "none" } });
    expect(r!.votes).toMatchObject([{ team: "marketing", level: "digest", reason: "a webinar about hiring is noise" }]);

    const g = await addToExam(db, itemId, { marketing: "log", rnd: "none", unknown: "alert" }, "Hiring webinars are not news");
    expect(g).toMatchObject({ id: `owner-${itemId}`, expected: { marketing: "log", rnd: "none" }, labelledBy: "owner", tags: ["from-feedback"] });
    expect(await toReview(db)).toEqual([]);
    // Adding again replaces the answer instead of duplicating the item.
    await addToExam(db, itemId, { marketing: "none" }, "");
    expect((await ownerGolden(db)).map((x) => x.expected)).toEqual([{ marketing: "none" }]);
  });

  it("the live exam grades the owner's item and the report shows it", async () => {
    const db = await testDb();
    const itemId = await setup(db);
    await addToExam(db, itemId, { marketing: "log", rnd: "none" }, "");
    const items = await examItems(db, []);
    expect(items.map((x) => x.id)).toEqual([`owner-${itemId}`]);
    // A golden file for the same page wins, so nothing is graded twice.
    expect((await examItems(db, [{ ...items[0]!, id: "file-copy" }])).map((x) => x.id)).toEqual(["file-copy"]);

    judgeReply.mockResolvedValue({ summary: "s", sameStoryAs: null, whatsNew: null, judgments: [
      { team: "marketing", level: "digest", why: "w", evidence: ["hosts a webinar"], topics: [] },
      { team: "rnd", level: "none", why: "w", evidence: [], topics: [] },
    ] });
    vi.spyOn(await import("../src/eval/golden"), "loadGolden").mockReturnValue([]);
    const r = await runEval(db);
    expect(r.graded).toBe(1);
    const [res] = ownerItemResults(r.outcomes, [`owner-${itemId}`]);
    expect(res).toMatchObject({ graded: true, agreed: false });
    const report = formatReport({ ...r, regressions: [], ownerItems: [`owner-${itemId}`] });
    expect(report).toContain("Added by the owner from team votes:** 0/1");
    expect(report).toContain("marketing expected log, got digest");
  });
});
