"use server";

import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { feedback } from "@/db/schema";
import { digestRatingToken } from "@/pipeline/slack";
import { pingOwnerOfVote } from "@/pipeline/vote-ping";

/** Saves the votes given on the digest rating page. Updates left on "skip" are not counted. */
export async function submitDigestRatings(form: FormData) {
  const ids = String(form.get("ids") ?? "").split(".").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const token = String(form.get("t") ?? "");
  const expected = digestRatingToken(ids);
  if (!ids.length || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) redirect("/feedback/invalid");
  const votes = ids
    .map((id) => ({ id, vote: String(form.get(`vote:${id}`) ?? ""), reason: String(form.get(`reason:${id}`) ?? "").trim().slice(0, 1000) || null }))
    .filter((v) => v.vote === "1" || v.vote === "0");
  if (votes.length) {
    const saved = await db().insert(feedback).values(votes.map((v) => ({ judgmentId: v.id, useful: v.vote === "1", reason: v.reason }))).returning();
    // Each "not useful" tells the team's owner in Slack; the votes are saved either way.
    for (const f of saved.filter((x) => !x.useful)) await pingOwnerOfVote(db(), f.id).catch((e) => console.error(`owner ping failed: ${(e as Error).message}`));
  }
  redirect(`/feedback/digest?ids=${ids.join(".")}&t=${token}&done=${votes.length}`);
}
