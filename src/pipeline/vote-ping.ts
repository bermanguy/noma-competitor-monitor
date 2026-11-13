import { and, asc, eq, isNull } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, feedback, item, judgment, person, team } from "../db/schema";
import { notifyOwner } from "./own-site";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The owners' channel message for one "not useful" vote, naming the team's owner. */
export function votePingMessage(v: { teamKey: string; teamName: string; competitor: string; title: string; url: string; level: string; reason: string | null; owner?: { name: string; title: string } | null }) {
  const owner = v.owner;
  const who = owner ? `${owner.name} (${owner.title})` : `${v.teamName} owner`;
  return {
    text: `${v.teamName} marked "${v.title}" not useful`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:thumbsdown: *${esc(v.teamName)}* marked a ${esc(v.level)} not useful: *<${v.url}|${esc(v.competitor)} · ${esc(v.title)}>*\n${v.reason ? `> ${esc(v.reason)}` : "_No reason given._"}`,
        },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `${esc(who)}, please review: pick the level ${esc(v.teamName)} should have got · <${config.publicUrl}/settings/review|Open To review>` }] },
    ],
  };
}

/**
 * Tells the team's owner, in the owners' channel, that a "not useful" vote is waiting in To review.
 * Best effort: the vote is already saved, so a Slack failure never loses it.
 */
export async function pingOwnerOfVote(db: DB, feedbackId: number): Promise<"sent" | "skipped" | "failed"> {
  const [row] = await db
    .select({ f: feedback, j: judgment, i: item, c: competitor, t: team })
    .from(feedback)
    .innerJoin(judgment, eq(feedback.judgmentId, judgment.id))
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(team, eq(team.key, judgment.teamKey))
    .where(eq(feedback.id, feedbackId));
  if (!row || row.f.useful) return "skipped";
  // The team's first owner, as listed on the People page.
  const [owner] = await db.select({ name: person.name, title: person.title }).from(person)
    .where(and(eq(person.teamKey, row.t.key), eq(person.role, "owner"), isNull(person.removedAt))).orderBy(asc(person.id)).limit(1);
  return notifyOwner(db, `vote:${feedbackId}`, votePingMessage({
    teamKey: row.t.key, teamName: row.t.name, competitor: row.c.name, title: row.i.title ?? row.i.url, url: row.i.url, level: row.j.level, reason: row.f.reason, owner,
  }));
}
