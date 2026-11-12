"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { clearPreview, runPreview } from "@/lib/lens-preview";
import { BudgetExceeded } from "@/pipeline/llm";

const page = (key: string) => `/teams/${encodeURIComponent(key)}`;

/** Re-judges the team's latest items with the draft description. Nothing is saved to the team. */
export async function previewLens(form: FormData) {
  const key = String(form.get("key"));
  const draft = String(form.get("lens") ?? "").trim();
  if (draft.length < 40) redirect(page(key) + "?error=" + encodeURIComponent("Describe what the team cares about in at least a sentence or two"));
  try {
    await runPreview(db(), key, draft);
  } catch (e) {
    const msg = e instanceof BudgetExceeded ? "The monthly model budget is used up, so the preview could not run." : `The preview could not run: ${(e as Error).message.slice(0, 160)}`;
    redirect(page(key) + "?error=" + encodeURIComponent(msg));
  }
  revalidatePath(page(key));
  redirect(page(key) + "#preview");
}

export async function discardPreview(form: FormData) {
  const key = String(form.get("key"));
  await clearPreview(db(), key);
  revalidatePath(page(key));
  redirect(page(key) + "?added=" + encodeURIComponent("Draft discarded. The description is unchanged."));
}
