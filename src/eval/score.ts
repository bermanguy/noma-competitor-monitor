import type { Level } from "./golden";

/** One graded answer: what one team should have got for one item, and what the judge gave. */
export interface Outcome {
  id: string; team: string; expected: Level; got: Level; evidenceOk: boolean;
  /** The judge's reason for this team, so a disagreement can be traced to its cause. */
  why?: string;
}

/** "Sent" means it reaches the team: alert now, or digest in the daily digest. */
export const isSent = (l: Level) => l === "alert" || l === "digest";

export interface TeamScore {
  team: string;
  graded: number;
  /** Of the items we would send, how many the team should get. The number that protects a team from noise. */
  precision: number | null;
  /** Of the items the team should get, how many we send. */
  recall: number | null;
  /** Same level exactly. */
  exact: number;
  /** Missed an alert completely, or alerted on something irrelevant. */
  severe: string[];
  /** Sent-level judgments whose quotes are not in the source; production holds these back. */
  evidenceFailures: string[];
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function scoreTeams(outcomes: Outcome[]): TeamScore[] {
  const teams = [...new Set(outcomes.map((o) => o.team))];
  return teams.map((team) => {
    const os = outcomes.filter((o) => o.team === team);
    // A sent-level judgment without evidence is never delivered, so it counts as not sent.
    const sent = (o: Outcome) => isSent(o.got) && o.evidenceOk;
    const tp = os.filter((o) => sent(o) && isSent(o.expected)).length;
    const fp = os.filter((o) => sent(o) && !isSent(o.expected)).length;
    const fn = os.filter((o) => !sent(o) && isSent(o.expected)).length;
    return {
      team,
      graded: os.length,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      exact: os.filter((o) => o.got === o.expected).length,
      severe: os
        .filter((o) => (o.expected === "alert" && !sent(o)) || (o.expected === "none" && o.got === "alert"))
        .map((o) => `${o.id}: expected ${o.expected}, got ${o.got}`),
      evidenceFailures: os.filter((o) => isSent(o.got) && !o.evidenceOk).map((o) => o.id),
    };
  });
}

/** A change may merge only if no team's precision drops and recall does not fall by more than the tolerance. */
export function regressions(current: TeamScore[], baseline: TeamScore[] | null, recallTolerance = 0.1): string[] {
  if (!baseline) return [];
  const out: string[] = [];
  for (const c of current) {
    const b = baseline.find((x) => x.team === c.team);
    if (!b) continue;
    if (b.precision !== null && c.precision !== null && c.precision < b.precision - 1e-9)
      out.push(`${c.team}: precision ${pct(b.precision)} → ${pct(c.precision)}`);
    if (b.recall !== null && c.recall !== null && c.recall < b.recall - recallTolerance)
      out.push(`${c.team}: recall ${pct(b.recall)} → ${pct(c.recall)}`);
  }
  return out;
}

export const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

export function formatReport(args: {
  promptVersion: string; model: string; when: string; scores: TeamScore[]; outcomes: Outcome[];
  regressions: string[]; failed: string[]; unlabelled: number; costUsd: number;
  stories?: { id: string; expected: number | null; got: number | null; whatsNew: string | null }[];
}): string {
  const { scores, outcomes } = args;
  const misses = outcomes.filter((o) => o.got !== o.expected);
  return [
    `# Eval ${args.when}`,
    "",
    `Prompt ${args.promptVersion} · model ${args.model} · ${new Set(outcomes.map((o) => o.id)).size} items graded · ${args.unlabelled} unlabelled · ${args.failed.length} failed · $${args.costUsd.toFixed(2)}`,
    "",
    "| Team | Precision | Recall | Exact level | Severe misses | Evidence failures |",
    "| --- | --- | --- | --- | --- | --- |",
    ...scores.map((s) => `| ${s.team} | ${pct(s.precision)} | ${pct(s.recall)} | ${s.exact}/${s.graded} | ${s.severe.length} | ${s.evidenceFailures.length} |`),
    "",
    args.regressions.length
      ? `**Regression against the baseline:**\n${args.regressions.map((r) => `- ${r}`).join("\n")}`
      : "No regression against the baseline.",
    args.failed.length ? `\n**Failed to judge:** ${args.failed.join(", ")}` : "",
    args.stories?.length
      ? `\n**Same-story links:** ${args.stories.filter((x) => x.got === x.expected).length}/${args.stories.length} correct\n${args.stories.map((x) => `- ${x.id}: expected ${x.expected ?? "no link"}, got ${x.got ?? "no link"}${x.whatsNew ? `. New: ${x.whatsNew}` : ""}`).join("\n")}`
      : "",
    "",
    "## Disagreements",
    "",
    misses.length
      ? ["| Item | Team | Expected | Got | Judge's reason |", "| --- | --- | --- | --- | --- |",
         ...misses.map((o) => `| ${o.id} | ${o.team} | ${o.expected} | ${o.got}${o.evidenceOk ? "" : " (no evidence)"} | ${(o.why ?? "").replace(/\|/g, "/")} |`)].join("\n")
      : "None.",
    "",
  ].join("\n");
}
