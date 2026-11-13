import { describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import { competitor, delivery, run, source, usage } from "../src/db/schema";
import { ALERT_RULES, computeMetrics } from "../src/lib/monitoring";

const H = 36e5;

describe("builder overview metrics", () => {
  it("shows no data instead of a false green on a fresh system", async () => {
    const db = await testDb();
    const m = Object.fromEntries((await computeMetrics(db)).map((x) => [x.key, x]));
    expect(Object.keys(m)).toHaveLength(8);
    for (const k of ["availability", "success", "delivery", "precision", "grounding", "useful"]) expect(m[k]!.status).toBe("none");
    expect(m.cost!.status).toBe("ok");
  });

  it("grades runs, sources, Slack posts and spend against their targets", async () => {
    const db = await testDb();
    const now = new Date();
    // 24 hours of 3-hour slots: 8 expected, 7 completed (6 ok, 1 partial), 1 failed.
    const statuses = ["ok", "ok", "ok", "ok", "ok", "ok", "partial", "failed"] as const;
    await db.insert(run).values(statuses.map((status, i) => ({
      status, trigger: "cron", startedAt: new Date(now.getTime() - (24 - i * 3) * H), finishedAt: new Date(now.getTime() - (24 - i * 3) * H + 6e5),
    })));
    const [c] = await db.insert(competitor).values({ name: "Acme", domain: "acme.test" }).returning();
    await db.insert(source).values([
      { competitorId: c!.id, kind: "page", url: "https://acme.test/a", label: "a", baselinedAt: now, lastSuccessAt: now },
      { competitorId: c!.id, kind: "page", url: "https://acme.test/b", label: "b", baselinedAt: now, lastSuccessAt: now, consecutiveFailures: 3, lastError: "403" },
    ]);
    await db.insert(delivery).values([
      { key: "a", kind: "alert", status: "sent" }, { key: "b", kind: "alert", status: "sending", error: "500" },
    ]);
    await db.insert(usage).values({ runId: 1, purpose: "judge", model: "m", inputTokens: 1, outputTokens: 1, costUsd: 35 });

    const m = Object.fromEntries((await computeMetrics(db, now)).map((x) => [x.key, x]));
    expect(m.availability!.value).toBe("88%");
    expect(m.availability!.status).toBe("warn");
    expect(m.success!.value).toBe("75%");
    expect(m.success!.status).toBe("warn");
    expect(m.delivery!.status).toBe("bad");
    expect(m.cost!.status).toBe("warn");
  });

  it("flags availability as bad when the last completed run is overdue, whatever the weekly share", async () => {
    const db = await testDb();
    const now = new Date();
    // A clean week, then nothing for the last 9 hours: 53 of 56 slots is near the line, but a missed run is an outage.
    await db.insert(run).values(Array.from({ length: 53 }, (_, i) => {
      const at = new Date(now.getTime() - (167 - i * 3) * H);
      return { status: "ok" as const, trigger: "cron", startedAt: at, finishedAt: at };
    }));
    const m = (await computeMetrics(db, now)).find((x) => x.key === "availability")!;
    expect(m.status).toBe("bad");
  });

  it("every alert rule points at a metric on the page", async () => {
    const keys = (await computeMetrics(await testDb())).map((m) => m.key);
    for (const r of ALERT_RULES) expect(keys).toContain(r.metric);
    expect(ALERT_RULES.some((r) => r.state === "active")).toBe(true);
  });
});
