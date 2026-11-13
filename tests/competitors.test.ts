import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import { competitor, source } from "../src/db/schema";
import { archiveCompetitor, createCompetitor, normalizeDomain } from "../src/lib/competitors";
import { activeSources } from "../src/pipeline/collect";

const home = { kind: "page" as const, url: "https://acme.test/", label: "Homepage", sample: [], role: "homepage" };
const blog = { kind: "listing" as const, url: "https://acme.test/blog", label: "Blog", linkPrefix: "/blog", sample: ["a"] };

describe("competitors", () => {
  it("normalises domains and rejects anything that isn't one", () => {
    expect(normalizeDomain("https://www.Acme.io/blog?x=1")).toBe("acme.io");
    expect(normalizeDomain("not a domain")).toBeNull();
  });

  it("creates a competitor with its sources and returns their ids; a duplicate fails", async () => {
    const db = await testDb();
    const r = await createCompetitor(db, { name: "Acme", domain: "acme.test", sources: [home, blog], addedBy: "claude:marketing" });
    expect(r.ok && r.sourceIds.length).toBe(2);
    const again = await createCompetitor(db, { name: "Acme", domain: "https://acme.test", sources: [], addedBy: "settings" });
    expect(again).toEqual({ ok: false, error: "Acme is already watched" });
  });

  it("removing keeps the history and stops checking; adding the domain again restores it", async () => {
    const db = await testDb();
    const r = await createCompetitor(db, { name: "Acme", domain: "acme.test", sources: [home], addedBy: "settings" });
    if (!r.ok) throw new Error(r.error);
    await archiveCompetitor(db, r.competitor.id, true);
    expect((await activeSources(db)).some((x) => x.c.id === r.competitor.id)).toBe(false);
    expect(await db.select().from(source).where(eq(source.competitorId, r.competitor.id))).toHaveLength(1);
    const back = await createCompetitor(db, { name: "Acme Inc", domain: "acme.test", sources: [home, blog], addedBy: "settings" });
    expect(back.ok && back.restored).toBe(true);
    expect(back.ok && back.sourceIds).toHaveLength(1); // the homepage was already there
    const [c] = await db.select().from(competitor).where(eq(competitor.id, r.competitor.id));
    expect(c!.archivedAt).toBeNull();
    expect(c!.active).toBe(true);
  });
});
