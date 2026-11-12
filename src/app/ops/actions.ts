"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, item, setting, source, type FetchMode, type SourceKind } from "@/db/schema";
import { runPipeline } from "@/pipeline/run";

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

export async function updateSource(form: FormData) {
  const id = Number(form.get("id"));
  const fetchMode = (form.get("fetchMode") === "browser" ? "browser" : "http") as FetchMode;
  const active = form.get("active") === "1";
  const url = String(form.get("url") ?? "").trim();
  const linkPrefix = String(form.get("linkPrefix") ?? "").trim() || null;
  await db().update(source).set({ fetchMode, active, url, linkPrefix, consecutiveFailures: 0, lastError: null }).where(eq(source.id, id));
  revalidatePath("/ops");
}

export async function addSource(form: FormData) {
  const competitorId = Number(form.get("competitorId"));
  const kind = String(form.get("kind")) as SourceKind;
  const url = String(form.get("url") ?? "").trim();
  const label = String(form.get("label") ?? "").trim() || kind;
  const linkPrefix = String(form.get("linkPrefix") ?? "").trim() || null;
  const [c] = await db().select().from(competitor).where(eq(competitor.id, competitorId));
  if (!c || !/^https?:\/\//.test(url)) redirect("/ops?msg=" + encodeURIComponent("Pick a competitor and a full URL"));
  await db().insert(source).values({ competitorId, kind, url, label, linkPrefix }).onConflictDoNothing();
  revalidatePath("/ops");
}

export async function retryItem(form: FormData) {
  await db().update(item).set({ status: "pending", statusDetail: null }).where(eq(item.id, Number(form.get("id"))));
  revalidatePath("/ops");
}
