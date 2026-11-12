"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, item, setting, source, type FetchMode, type PageType, type SourceKind } from "@/db/schema";
import { runPipeline } from "@/pipeline/run";
import { saveBaseline, startExam } from "@/eval/run";

export async function runNow() {
  // Runs in the background of the web process; the run record shows progress.
  void runPipeline(db(), "manual").catch((e) => console.error("manual run failed", e));
  redirect("/ops?msg=" + encodeURIComponent("Run started. Refresh in a minute to see it below."));
}

export async function saveCanary(form: FormData) {
  const value = String(form.get("text") ?? "").trim();
  await db().insert(setting).values({ key: "canary", value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
  revalidatePath("/canary");
  redirect("/ops?msg=" + encodeURIComponent("Canary page updated. The next run will detect the change."));
}

export async function saveCanaryPricing(form: FormData) {
  const value = String(form.get("text") ?? "").trim();
  await db().insert(setting).values({ key: "canary-pricing", value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
  revalidatePath("/canary/pricing");
  redirect("/ops?msg=" + encodeURIComponent("Pricing canary updated. The next run will compare plans, prices and features."));
}

export async function updateSource(form: FormData) {
  const id = Number(form.get("id"));
  const fetchMode = (form.get("fetchMode") === "browser" ? "browser" : "http") as FetchMode;
  const active = form.get("active") === "1";
  const url = String(form.get("url") ?? "").trim();
  const linkPrefix = String(form.get("linkPrefix") ?? "").trim() || null;
  const pageType = (form.get("pageType") === "pricing" ? "pricing" : "general") as PageType;
  await db().update(source).set({ fetchMode, active, url, linkPrefix, pageType, consecutiveFailures: 0, lastError: null }).where(eq(source.id, id));
  revalidatePath("/ops");
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
  if (!c || !/^https?:\/\//.test(url)) redirect("/ops?msg=" + encodeURIComponent("Pick a competitor and a full URL"));
  await db().insert(source).values({ competitorId, kind, url, label, linkPrefix, pageType }).onConflictDoNothing();
  revalidatePath("/ops");
}

export async function retryItem(form: FormData) {
  await db().update(item).set({ status: "pending", statusDetail: null }).where(eq(item.id, Number(form.get("id"))));
  revalidatePath("/ops");
}

/** Grades the live prompts on the golden set, in the background. About 2 minutes and a few dollars. */
export async function runExam() {
  const started = await startExam(db());
  redirect("/ops?msg=" + encodeURIComponent(started ? "Exam started. It takes about 2 minutes; refresh to see the result under Output quality." : "An exam is already running."));
}

export async function saveExamBaseline() {
  await saveBaseline(db());
  revalidatePath("/ops");
  redirect("/ops?msg=" + encodeURIComponent("Saved as the baseline. Later exams are compared with it."));
}
