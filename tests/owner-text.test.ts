import { describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import { getOwnerTexts, ownerTextDefault, setOwnerText } from "../src/lib/owner-text";
import { buildJudgeUser } from "../src/pipeline/judge";

describe("owner text", () => {
  it("starts from the files and then uses what the owner saved", async () => {
    const db = await testDb();
    expect((await getOwnerTexts(db)).company).toBe(ownerTextDefault("company"));
    await setOwnerText(db, "company", "Noma sells agent security, now including browser agents.");
    const t = await getOwnerTexts(db);
    expect(t.company).toContain("browser agents");
    expect(t.levels).toBe(ownerTextDefault("levels"));
  });

  it("puts what Noma sells and the levels in every judgment, and page guidance only for that page type", () => {
    const base = {
      competitor: "Acme", url: "https://acme.test", title: "t", publishedAt: null, text: "x",
      teams: [{ key: "product", name: "Product", lens: "lens" }], topics: [], company: "COMPANY TEXT", levels: "LEVELS TEXT",
      pageGuidance: "PRICING GUIDANCE",
    };
    const post = buildJudgeUser({ ...base, kind: "post" });
    expect(post).toContain("<company>\nCOMPANY TEXT");
    expect(post).toContain("LEVELS TEXT");
    expect(post).not.toContain("PRICING GUIDANCE");
    expect(buildJudgeUser({ ...base, kind: "page_change", pageType: "pricing", diff: "d" })).toContain("PRICING GUIDANCE");
  });
});
