import { describe, expect, it } from "vitest";
import { loadGolden } from "../src/eval/golden";
import { digestPreview, regressions, scoreTeams, topicCheck, type Outcome } from "../src/eval/score";

const o = (id: string, team: string, expected: Outcome["expected"], got: Outcome["got"], evidenceOk = true): Outcome => ({ id, team, expected, got, evidenceOk });

describe("eval scoring", () => {
  it("passes the topic check when any fitting topic is tagged, and previews each team's digest", () => {
    expect(topicCheck("a", ["MCP and agent skills security", "AI red teaming"], ["ai red teaming", "Category language"]).hit).toBe(true);
    expect(topicCheck("b", ["Category language"], [])).toMatchObject({ hit: false, got: [] });
    const preview = digestPreview([
      { ...o("x", "product", "alert", "alert"), topics: ["AI red teaming"] },
      { ...o("y", "product", "log", "digest"), topics: [] },
      o("z", "rnd", "none", "log"),
    ]);
    expect(preview).toContain("**product** (2 sent: 1 alerts)");
    expect(preview).toContain("- _AI red teaming_ (1)\n  - 🔔 x");
    expect(preview).toContain("- _Other_ (1)\n  - y (answer key: log)");
    expect(preview).toContain("**rnd:** nothing would be sent.");
  });


  it("counts alert and digest as sent, and scores precision and recall per team", () => {
    const [m] = scoreTeams([
      o("a", "marketing", "alert", "digest"), // sent, should be sent: hit, wrong level
      o("b", "marketing", "none", "digest"), // sent, should not be: noise
      o("c", "marketing", "digest", "log"), // missed
      o("d", "marketing", "log", "log"),
    ]);
    expect(m).toMatchObject({ team: "marketing", graded: 4, precision: 0.5, recall: 0.5, exact: 1 });
  });

  it("treats a sent judgment without evidence as not sent, and flags it", () => {
    const [s] = scoreTeams([o("a", "rnd", "alert", "alert", false)]);
    expect(s!.recall).toBe(0);
    expect(s!.evidenceFailures).toEqual(["a"]);
    expect(s!.severe).toEqual(["a: expected alert, got alert"]);
  });

  it("flags a missed alert and an alert on something irrelevant as severe", () => {
    const [s] = scoreTeams([o("a", "product", "alert", "log"), o("b", "product", "none", "alert"), o("c", "product", "none", "digest")]);
    expect(s!.severe).toEqual(["a: expected alert, got log", "b: expected none, got alert"]);
  });

  it("blocks a precision drop but tolerates a small recall dip", () => {
    const base = scoreTeams([o("a", "rnd", "alert", "alert"), o("b", "rnd", "digest", "digest")]);
    const worse = scoreTeams([o("a", "rnd", "alert", "alert"), o("b", "rnd", "none", "digest")]);
    expect(regressions(worse, base)).toEqual(["rnd: precision 100% → 50%"]);
    expect(regressions(base, base)).toEqual([]);
    expect(regressions(base, null)).toEqual([]);
  });
});

describe("golden set", () => {
  it("loads, and every labelled item names a level for every team", () => {
    const items = loadGolden();
    expect(items.length).toBeGreaterThan(0);
    for (const g of items.filter((x) => x.expected)) expect(Object.keys(g.expected!).sort()).toEqual(["marketing", "product", "rnd"]);
  });
});

describe("golden export", () => {
  it("exports judged, non-canary items without the model's answer", async () => {
    const { testDb } = await import("./helpers");
    const { competitor, item, source } = await import("../src/db/schema");
    const { exportGolden } = await import("../src/eval/export");
    const { GoldenItem } = await import("../src/eval/golden");
    const db = await testDb();
    const [c] = await db.insert(competitor).values({ name: "Acme Corp", domain: "acme.test" }).returning();
    const [s] = await db.insert(source).values({ competitorId: c!.id, kind: "listing", url: "https://acme.test/blog", label: "Blog" }).returning();
    const row = { sourceId: s!.id, competitorId: c!.id, kind: "post" as const, text: "Acme launched a gateway that inspects every tool call." };
    await db.insert(item).values([
      { ...row, url: "https://acme.test/blog/a", title: "Launching Gatekeeper!", status: "judged", dedupeKey: "a" },
      { ...row, url: "https://acme.test/blog/b", title: "Old", status: "baseline", dedupeKey: "b" },
      { ...row, url: "https://acme.test/blog/c", title: "Canary", status: "judged", dedupeKey: "c", isCanary: true },
    ]);
    const out = await exportGolden(db, { latest: 10 });
    expect(out.map((g) => g.id)).toEqual(["live-acme-corp-launching-gatekeeper"]);
    expect(out[0]!.expected).toBeNull();
    expect(GoldenItem.safeParse(out[0]).success).toBe(true);
  });
});
