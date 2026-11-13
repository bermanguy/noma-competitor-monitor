import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { problemReport, type ProblemReportStatus } from "@/db/schema";
import { config } from "@/config";
import { sendOnce } from "@/pipeline/deliver";
import { ROLE_NAME, type Viewer } from "./view-as";

/** A screenshot can be large on a retina screen; a video should be a short screen recording. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_DESCRIPTION = 4000;

export interface Attachment { name: string; type: string; size: number }

/** Why an attachment can't be sent, in words the reporter can act on; null when it's fine. */
export function attachmentProblem(a: Attachment): string | null {
  const isImage = a.type.startsWith("image/");
  const isVideo = a.type.startsWith("video/");
  if (!isImage && !isVideo) return "Attach a screenshot or a video. Other files can't be shown.";
  if (isImage && a.size > MAX_IMAGE_BYTES) return `That screenshot is ${mb(a.size)}. Screenshots can be up to 5 MB.`;
  if (isVideo && a.size > MAX_VIDEO_BYTES) return `That video is ${mb(a.size)}. Videos can be up to 25 MB, about 30 seconds of screen recording.`;
  return null;
}

export const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`);

export interface NewReport {
  description: string;
  page: string;
  viewer: Viewer;
  userAgent?: string | null;
  file?: (Attachment & { data: Uint8Array }) | null;
}

/** Stores a report and tells the ops channel. A Slack failure never loses the report. */
export async function createReport(db: DB, r: NewReport): Promise<{ id: number; slack: "sent" | "skipped" | "failed" | "off" }> {
  const description = r.description.trim().slice(0, MAX_DESCRIPTION);
  if (!description) throw new Error("Say what went wrong.");
  if (r.file) {
    const problem = attachmentProblem(r.file);
    if (problem) throw new Error(problem);
  }
  const [row] = await db.insert(problemReport).values({
    description,
    page: r.page.slice(0, 500) || "/",
    reporterKey: r.viewer.key,
    reporterName: r.viewer.name,
    reporterRole: r.viewer.role,
    reporterTeam: r.viewer.team,
    userAgent: r.userAgent?.slice(0, 300) ?? null,
    fileName: r.file?.name.slice(0, 200) ?? null,
    fileType: r.file?.type ?? null,
    fileSize: r.file?.size ?? null,
    fileData: r.file?.data ?? null,
  }).returning({ id: problemReport.id });
  const id = row!.id;
  if (!process.env[config.opsWebhookEnv]) return { id, slack: "off" };
  const slack = await sendOnce(db, `report:${id}`, { kind: "ops", teamKey: null, judgmentIds: [] }, config.opsWebhookEnv, reportSlackMessage({
    id, description, page: r.page, viewer: r.viewer, file: r.file ?? null,
  }));
  return { id, slack };
}

const TEAM_NAME: Record<string, string> = { marketing: "Marketing", product: "Product", rnd: "R&D" };
export const reporterLine = (name: string, role: string, team: string | null) =>
  `${name} (${ROLE_NAME[role as Viewer["role"]] ?? role}${team ? ` · ${TEAM_NAME[team] ?? team}` : ""})`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportSlackMessage(r: { id: number; description: string; page: string; viewer: Viewer; file: Attachment | null }) {
  const who = reporterLine(r.viewer.name, r.viewer.role, r.viewer.team);
  const quoted = esc(r.description.slice(0, 1500)).split("\n").map((l) => `> ${l}`).join("\n");
  const file = r.file ? ` · ${r.file.type.startsWith("video/") ? "🎬 video" : "🖼️ screenshot"} attached` : "";
  return {
    text: `Problem reported by ${r.viewer.name}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `:lady_beetle: *Problem reported by ${esc(who)}*\n${quoted}` } },
      { type: "context", elements: [{ type: "mrkdwn", text: `On <${config.publicUrl}${r.page}|${esc(r.page)}>${file} · <${reportUrl(r.id)}|Open in Builder › Problem reports>` }] },
    ],
  };
}

export const reportUrl = (id: number) => `${config.publicUrl}/ops/reports#report-${id}`;

/** Every report without its file bytes, newest first. */
export async function listReports(db: DB) {
  return db.select({
    id: problemReport.id, description: problemReport.description, page: problemReport.page,
    reporterName: problemReport.reporterName, reporterRole: problemReport.reporterRole, reporterTeam: problemReport.reporterTeam,
    userAgent: problemReport.userAgent, status: problemReport.status,
    fileName: problemReport.fileName, fileType: problemReport.fileType, fileSize: problemReport.fileSize,
    createdAt: problemReport.createdAt, fixedAt: problemReport.fixedAt,
  }).from(problemReport).orderBy(desc(problemReport.id)).limit(200);
}

export async function openReportCount(db: DB): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(problemReport).where(eq(problemReport.status, "open"));
  return Number(r?.n ?? 0);
}

export async function setReportStatus(db: DB, id: number, status: ProblemReportStatus) {
  await db.update(problemReport).set({ status, fixedAt: status === "fixed" ? new Date() : null }).where(eq(problemReport.id, id));
}

export async function reportFile(db: DB, id: number) {
  const [r] = await db.select({ name: problemReport.fileName, type: problemReport.fileType, data: problemReport.fileData })
    .from(problemReport).where(eq(problemReport.id, id));
  return r?.data && r.type ? { name: r.name ?? "attachment", type: r.type, data: r.data } : null;
}

/** "Chrome on Mac" from a user agent, enough to reproduce a problem. The full string is on hover. */
export function browserName(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
