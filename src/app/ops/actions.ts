"use server";

import { eq } from "drizzle-orm";
import { localDateTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, item, setting, source, type FetchMode, type PageType, type SourceKind } from "@/db/schema";
import { runPipeline } from "@/pipeline/run";
import { saveBaseline, startExam } from "@/eval/run";
import { setReportStatus } from "@/lib/reports";

export async function runNow() {
  // Runs in the background of the web process; the run record shows progress.
  void runPipeline(db(), "manual").catch((e) => console.error("manual run failed", e));
  redirect("/ops/runs?msg=" + encodeURIComponent("Run started. Refresh in a minute to see it below."));
}

export async function saveCanary(form: FormData) {
  const value = String(form.get("text") ?? "").trim();
  await db().insert(setting).values({ key: "canary", value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
  revalidatePath("/canary");
  redirect("/ops/canary?msg=" + encodeURIComponent("Canary page updated. The next run will detect the change."));
}

export async function saveCanaryPricing(form: FormData) {
  const value = String(form.get("text") ?? "").trim();
  await db().insert(setting).values({ key: "canary-pricing", value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
  revalidatePath("/canary/pricing");
  redirect("/ops/canary?msg=" + encodeURIComponent("Pricing canary updated. The next run will compare plans, prices and features."));
}

export async function updateSource(form: FormData) {
  const id = Number(form.get("id"));
  const fetchMode = (form.get("fetchMode") === "browser" ? "browser" : "http") as FetchMode;
  const active = form.get("active") === "1";
  const url = String(form.get("url") ?? "").trim();
  const linkPrefix = String(form.get("linkPrefix") ?? "").trim() || null;
  const pageType = (form.get("pageType") === "pricing" ? "pricing" : "general") as PageType;
  await db().update(source).set({ fetchMode, active, url, linkPrefix, pageType, consecutiveFailures: 0, lastError: null }).where(eq(source.id, id));
  revalidatePath("/ops", "layout");
}

export async function addSource(form: FormData) {
  const competitorId = Number(form.get("competitorId"));
  // "pricing" is a watched page read with the pricing skill.
  const choice = String(form.get("kind"));
  const kind = (choice === "pricing" ? "page" : choice) as SourceKind;
  const pageType: PageType = choice === "pricing" ? "pricing" : "general";
  const url = String(form.get("url") ?? "").trim();
  const label = String(form.get("label") ?? "").trim() || kind;
  const linkPrefix = String(form.get("linkPrefix") ?? "").trim() || null;
  const [c] = await db().select().from(competitor).where(eq(competitor.id, competitorId));
  if (!c || !/^https?:\/\//.test(url)) redirect("/ops/sources?msg=" + encodeURIComponent("Pick a competitor and a full URL"));
  await db().insert(source).values({ competitorId, kind, url, label, linkPrefix, pageType }).onConflictDoNothing();
  revalidatePath("/ops", "layout");
}

export async function retryItem(form: FormData) {
  await db().update(item).set({ status: "pending", statusDetail: null }).where(eq(item.id, Number(form.get("id"))));
  revalidatePath("/ops", "layout");
}

/** Grades the live prompts on the golden set, in the background. About 2 minutes and a few dollars. */
export async function runExam() {
  const started = await startExam(db());
  redirect("/ops/evals" + (started ? "" : "?msg=" + encodeURIComponent("A run is already in progress.")));
}

export async function saveExamBaseline() {
  const r = await saveBaseline(db());
  revalidatePath("/ops", "layout");
  const msg = !r ? "Nothing to save yet: run the evals first."
    : `Baseline updated: was ${r.was ? localDateTime(r.was) : "none"}, now ${localDateTime(r.now)}. New runs are compared with this one.`;
  redirect("/ops/evals?msg=" + encodeURIComponent(msg));
}

export async function markReport(form: FormData) {
  const status = form.get("status") === "fixed" ? "fixed" : "open";
  await setReportStatus(db(), Number(form.get("id")), status);
  revalidatePath("/ops/reports");
  redirect("/ops/reports");
}
