import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { config } from "../config";
import type { DB } from "../db/client";
import { competitor, delivery, item, judgment, source, type Level } from "../db/schema";
import { earlierItems, loadContext } from "./assess";
import { localNow, planDelivery, slackItems } from "./deliver";
import { judgeItem } from "./judge";
import { BudgetExceeded } from "./llm";
import { alertMessage, digestMessages, type SlackItem } from "./slack";

export interface DigestPreview {
  /** "next": what the next digest will hold. "last": nothing is waiting, so the last one this team got. */
  mode: "next" | "last" | "empty";
  /** The Slack messages exactly as they would be posted. */
  parts: { text: string; blocks: unknown[] }[];
  /** Urgent changes that go out on their own, right away, at the next check. */
  alerts: { text: string; blocks: unknown[] }[];
  storyCount: number;
  /** When the digest goes, in words, e.g. "tomorrow at 08:00". */
  when: string;
  lastSentAt: Date | null;
  quiet: boolean;
}

function whenNext(now: Date, lastSentAt: Date | null): string {
  const { hour, date } = localNow(now);
  const at = `${String(config.digestHourLocal).padStart(2, "0")}:00`;
  if (lastSentAt && localNow(lastSentAt).date === date) return `tomorrow at about ${at}`;
  // Runs are every 3 hours, so a digest due today goes with the next run at or after the digest hour.
  return hour >= config.digestHourLocal ? "with the next check" : `today at about ${at}`;
}

/**
 * The next digest for one team, built by the same code that sends it, so the preview never drifts
 * from Slack. When nothing is waiting, it shows the last digest the team got, so there is always
 * something to look at.
 */
export async function previewDigest(db: DB, teamKey: string, now = new Date()): Promise<DigestPreview> {
  const { teams, topicOrder, plan, items } = await planDelivery(db, now);
  const t = teams.find((x) => x.key === teamKey);
  if (!t) throw new Error(`no team ${teamKey}`);
  const pick = (ids: number[]) => ids.map((id) => items.get(id)).filter((x): x is SlackItem => !!x);
  const alerts = pick(plan.alerts.get(teamKey) ?? []).map((i) => alertMessage(t.name, i));
  const waiting = pick(plan.digest.get(teamKey) ?? []);
  const quiet = t.noise === "quiet";

  const [last] = await db.select().from(delivery)
    .where(and(eq(delivery.teamKey, teamKey), eq(delivery.kind, "digest"), eq(delivery.status, "sent")))
    .orderBy(desc(delivery.createdAt)).limit(1);

  if (waiting.length) {
    const parts = digestMessages(t.name, waiting, topicOrder).map((p) => p.payload);
    return { mode: "next", parts, alerts, storyCount: waiting.length, when: whenNext(now, last?.createdAt ?? null), lastSentAt: last?.createdAt ?? null, quiet };
  }
  if (last) {
    // Every part sent that day, rebuilt from the judgments it carried.
    const day = new Date(last.createdAt.getTime() - 12 * 3600e3);
    const sameDay = await db.select().from(delivery)
      .where(and(eq(delivery.teamKey, teamKey), eq(delivery.kind, "digest"), eq(delivery.status, "sent"), gte(delivery.createdAt, day)));
    const ids = [...new Set(sameDay.flatMap((d) => d.judgmentIds))];
    const lastItems = [...(await slackItems(db, ids)).values()].filter((i) => !i.isCanary);
    // A digest that held only test pages has nothing to show.
    if (lastItems.length) {
      const parts = digestMessages(t.name, lastItems, topicOrder).map((p) => p.payload);
      return { mode: "last", parts, alerts, storyCount: lastItems.length, when: whenNext(now, last.createdAt), lastSentAt: last.createdAt, quiet };
    }
  }
  return { mode: "empty", parts: [], alerts, storyCount: 0, when: whenNext(now, null), lastSentAt: null, quiet };
}

export interface LensTrial {
  itemId: number;
  competitor: string;
  title: string;
  url: string;
  /** Judged just now with the current wording, in the same way as the edit, so the two compare fairly. */
  before: { level: Level; why: string };
  after: { level: Level; why: string } | null;
  /** The level the team actually got when it was first judged, shown only when it differs from `before`. */
  sent: Level;
  error?: string;
}

/**
 * Re-judges this team's latest changes twice, side by side: once with the current description and
 * once with the draft, each with all teams in the call exactly as the pipeline does it. Comparing two
 * fresh answers, not a fresh answer with an old stored one, keeps the judge's run-to-run variance and
 * any prompt changes since then from showing up as "your edit changed this". Saves nothing.
 */
export async function tryLens(db: DB, teamKey: string, draftLens: string, limit = 5): Promise<LensTrial[]> {
  const ctx = await loadContext(db);
  const t = ctx.teams.find((x) => x.key === teamKey);
  if (!t) throw new Error(`no team ${teamKey}`);
  const current = ctx.teams.map((x) => ({ key: x.key, name: x.name, lens: x.lens }));
  const draft = current.map((x) => (x.key === teamKey ? { ...x, lens: draftLens } : x));
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = await db
    .select({ i: item, c: competitor, pageType: source.pageType, j: judgment })
    .from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(source, eq(item.sourceId, source.id))
    .where(and(eq(judgment.teamKey, teamKey), eq(item.status, "judged"), eq(item.isCanary, false), gte(item.firstSeenAt, since), inArray(judgment.level, ["alert", "digest", "log", "none"])))
    .orderBy(desc(item.firstSeenAt))
    .limit(limit);

  return Promise.all(rows.map(async ({ i, c, pageType, j }): Promise<LensTrial> => {
    const base = { itemId: i.id, competitor: c.name, title: i.title ?? i.url, url: i.url, sent: j.level };
    const stored = { level: j.level, why: j.why };
    try {
      const earlier = await earlierItems(db, c.id, i.id);
      const judge = (teams: typeof current) => judgeItem(db, undefined, {
        competitor: c.name, kind: i.kind, pageType, url: i.url, title: i.title, publishedAt: i.publishedAt,
        text: i.text, diff: i.diff, teams, topics: ctx.topics, examples: ctx.examples,
        company: ctx.owner.company, levels: ctx.owner.levels, pageGuidance: pageType === "pricing" ? ctx.owner["page.pricing"] : undefined,
        earlier,
      });
      const [now, edit] = await Promise.all([judge(current), judge(draft)]);
      const a = now.judgments.find((x) => x.team === teamKey);
      const b = edit.judgments.find((x) => x.team === teamKey);
      return {
        ...base,
        before: a ? { level: a.level, why: a.why } : stored,
        after: b ? { level: b.level, why: b.why } : null,
        error: b ? undefined : "No answer for this team",
      };
    } catch (e) {
      return { ...base, before: stored, after: null, error: e instanceof BudgetExceeded ? "The monthly model budget is used up" : "Could not judge this one" };
    }
  }));
}
