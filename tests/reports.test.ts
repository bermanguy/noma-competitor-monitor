import { afterEach, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import { delivery } from "../src/db/schema";
import { attachmentProblem, createReport, listReports, openReportCount, reportFile, reportSlackMessage, setReportStatus, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../src/lib/reports";
import type { Viewer } from "../src/lib/view-as";

const lior: Viewer = { key: "lior", name: "Lior", title: "PMM", role: "member", team: "marketing" };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("problem reports", () => {
  it("accepts screenshots and short videos, and says why anything else is refused", () => {
    expect(attachmentProblem({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(attachmentProblem({ name: "a.mov", type: "video/quicktime", size: MAX_VIDEO_BYTES })).toBeNull();
    expect(attachmentProblem({ name: "a.png", type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/up to 5 MB/);
    expect(attachmentProblem({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toMatch(/up to 25 MB/);
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 10 })).toMatch(/screenshot or a video/);
  });

  it("stores the report with its file and who sent it, and lists it without the bytes", async () => {
    const db = await testDb();
    const data = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const { id, slack } = await createReport(db, {
      description: "  Save does nothing on Topics  ", page: "/settings/topics?x=1", viewer: lior, userAgent: "UA",
      file: { name: "shot.png", type: "image/png", size: data.byteLength, data },
    });
    expect(slack).toBe("off");
    const [r] = await listReports(db);
    expect(r).toMatchObject({ id, description: "Save does nothing on Topics", page: "/settings/topics?x=1", reporterName: "Lior", reporterRole: "member", reporterTeam: "marketing", status: "open", fileType: "image/png", fileSize: 7 });
    expect(r).not.toHaveProperty("fileData");
    const f = await reportFile(db, id);
    expect([...f!.data]).toEqual([...data]);
    expect(await openReportCount(db)).toBe(1);
    await setReportStatus(db, id, "fixed");
    expect(await openReportCount(db)).toBe(0);
    expect((await listReports(db))[0]!.fixedAt).toBeInstanceOf(Date);
  });

  it("refuses an empty description or a file that is too big, and stores nothing", async () => {
    const db = await testDb();
    await expect(createReport(db, { description: "   ", page: "/", viewer: lior })).rejects.toThrow(/what went wrong/);
    await expect(createReport(db, { description: "x", page: "/", viewer: lior, file: { name: "a.zip", type: "application/zip", size: 3, data: new Uint8Array(3) } })).rejects.toThrow();
    expect(await listReports(db)).toHaveLength(0);
  });

  it("posts once to the ops channel, and keeps the report when Slack is down", async () => {
    const db = await testDb();
    vi.stubEnv("SLACK_WEBHOOK_OPS", "https://hooks.slack.test/ops");
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { posts.push(JSON.parse(String(init.body))); return new Response("ok"); }));
    const a = await createReport(db, { description: "Wizard stuck", page: "/settings/competitors", viewer: lior });
    expect(a.slack).toBe("sent");
    expect(JSON.stringify(posts[0])).toContain("Lior (Member · Marketing)");
    expect((await db.select().from(delivery))[0]).toMatchObject({ key: `report:${a.id}`, kind: "ops" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const b = await createReport(db, { description: "Again", page: "/", viewer: lior });
    expect(b.slack).toBe("failed");
    expect(await listReports(db)).toHaveLength(2);
  });

  it("links the report from Slack and escapes what the reporter typed", () => {
    const m = reportSlackMessage({ id: 7, description: "<script> & more\nline two", page: "/", viewer: lior, file: { name: "v.mp4", type: "video/mp4", size: 1 } });
    const s = JSON.stringify(m);
    expect(s).toContain("&lt;script&gt; &amp; more");
    expect(s).toContain("> line two");
    expect(s).toContain("/ops/reports#report-7");
    expect(s).toContain("video attached");
  });
});
