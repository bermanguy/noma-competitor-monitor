import type { Level, NoiseLevel } from "../db/schema";

export interface Candidate {
  judgmentId: number;
  teamKey: string;
  level: Level;
  evidenceOk: boolean;
  createdAt: Date;
}

export interface TeamPolicy {
  key: string;
  noise: NoiseLevel;
  dailyAlertCap: number;
}

export interface RoutePlan {
  /** Judgment ids to post right away, per team. */
  alerts: Map<string, number[]>;
  /** Judgment ids for the next daily digest, per team. */
  digest: Map<string, number[]>;
}

/**
 * Pure routing rule.
 * - Only judgments that passed the evidence check are ever sent.
 * - "alert" goes out now, up to the team's daily cap; overflow moves to the digest.
 * - "digest" goes to the daily digest, unless the team chose "quiet".
 * - "log" and "none" are never sent; they stay visible in the web feed.
 */
export function plan(
  candidates: Candidate[],
  teams: TeamPolicy[],
  alreadySent: Set<number>,
  alertsSentToday: Map<string, number>,
): RoutePlan {
  const alerts = new Map<string, number[]>();
  const digest = new Map<string, number[]>();
  const byKey = new Map(teams.map((t) => [t.key, t]));
  const sorted = [...candidates].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const c of sorted) {
    const t = byKey.get(c.teamKey);
    if (!t || !c.evidenceOk || alreadySent.has(c.judgmentId)) continue;
    if (c.level === "alert") {
      const sent = (alertsSentToday.get(t.key) ?? 0) + (alerts.get(t.key)?.length ?? 0);
      if (sent < t.dailyAlertCap) push(alerts, t.key, c.judgmentId);
      else if (t.noise === "normal") push(digest, t.key, c.judgmentId);
    } else if (c.level === "digest" && t.noise === "normal") {
      push(digest, t.key, c.judgmentId);
    }
  }
  return { alerts, digest };
}

function push(m: Map<string, number[]>, k: string, v: number) {
  m.set(k, [...(m.get(k) ?? []), v]);
}
