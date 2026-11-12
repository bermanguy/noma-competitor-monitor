"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { competitor, source, team, topic, type NoiseLevel } from "@/db/schema";
import { discoverSources } from "@/pipeline/discover";

export async function addCompetitor(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) redirect("/settings?error=" + encodeURIComponent("Enter a name and a website like example.com"));
  const d = db();
  const [existing] = await d.select().from(competitor).where(eq(competitor.domain, domain));
  if (existing) redirect("/settings?error=" + encodeURIComponent(`${existing.name} is already watched`));

  const found = await discoverSources(domain);
  const [c] = await d.insert(competitor).values({ name, domain }).returning();
  for (const s of found.sources) {
    await d.insert(source).values({ competitorId: c!.id, kind: s.kind, url: s.url, label: s.label, linkPrefix: s.linkPrefix }).onConflictDoNothing();
  }
  const summary = found.sources
    .map((s) => `${s.label}${s.sample.length ? ` (latest: ${s.sample.slice(0, 3).join("; ")})` : ""}`)
    .join(" · ");
  const msg = `${name} added. Watching: ${summary || "nothing yet"}. ${found.notes.join(" ")} The first check runs within 3 hours; what's already published is recorded as history, and only new posts and changes are reported.`;
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(msg));
}

export async function setCompetitorActive(form: FormData) {
  await db().update(competitor).set({ active: form.get("active") === "1" }).where(eq(competitor.id, Number(form.get("id"))));
  revalidatePath("/settings");
}

export async function addTopic(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const teamKeys = form.getAll("teams").map(String);
  if (!name || teamKeys.length === 0) redirect("/settings?error=" + encodeURIComponent("A topic needs a name and at least one team"));
  await db().insert(topic).values({ name, description: description || name, teamKeys });
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent(`Topic "${name}" added. It is used from the next check onward.`));
}

export async function removeTopic(form: FormData) {
  await db().update(topic).set({ active: false }).where(eq(topic.id, Number(form.get("id"))));
  revalidatePath("/settings");
}

export async function updateTeam(form: FormData) {
  const lens = String(form.get("lens") ?? "").trim();
  const noise = (form.get("noise") === "quiet" ? "quiet" : "normal") as NoiseLevel;
  if (lens.length < 40) redirect("/settings?error=" + encodeURIComponent("Describe what the team cares about in at least a sentence or two"));
  await db().update(team).set({ lens, noise }).where(eq(team.key, String(form.get("key"))));
  revalidatePath("/settings");
  redirect("/settings?added=" + encodeURIComponent("Saved. Changes apply from the next check."));
}
