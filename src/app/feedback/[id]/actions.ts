"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { feedback } from "@/db/schema";
import { feedbackToken } from "@/pipeline/slack";
import { timingSafeEqual } from "node:crypto";

export async function submitFeedback(form: FormData) {
  const id = Number(form.get("id"));
  const token = String(form.get("t") ?? "");
  const expected = feedbackToken(id);
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) redirect("/feedback/invalid");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 1000) || null;
  await db().insert(feedback).values({ judgmentId: id, useful: form.get("useful") === "1", reason });
  redirect(`/feedback/${id}?t=${token}&done=1`);
}
