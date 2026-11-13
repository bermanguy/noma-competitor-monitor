import type { Level } from "./golden";

/** One graded answer: what one team should have got for one item, and what the judge gave. */
export interface Outcome {
  id: string; team: string; expected: Level; got: Level; evidenceOk: boolean;
  /** The judge's reason for this team, so a disagreement can be traced to its cause. */
  why?: string;
  /** Topics the judge tagged for this team; they decide the item's section in the digest. */
  topics?: string[];
}

/** Did the judge tag the item with a topic that fits it? */
export interface TopicCheck { id: string; expected: string[]; got: string[]; hit: boolean }

export function topicCheck(id: string, expected: string[], got: string[]): TopicCheck {
  const want = new Set(expected.map((t) => t.toLowerCase()));
  const uniq = [...new Set(got)];
  return { id, expected, got: uniq, hit: uniq.some((t) => want.has(t.toLowerCase())) };
}

/** What each team's digest would have held in this exam: sent items grouped by their first topic, as the digest groups them. */
export function digestPreview(outcomes: Outcome[]): string {
  const teams = [...new Set(outcomes.map((o) => o.team))];
  return teams.map((team) => {
    const sent = outcomes.filter((o) => o.team === team && isSent(o.got));
    if (!sent.length) return `**${team}:** nothing would be sent.`;
    const groups = new Map<string, Outcome[]>();
    for (const o of sent) { const k = o.topics?.[0] ?? "Other"; groups.set(k, [...(groups.get(k) ?? []), o]); }
    const order = [...groups.entries()].sort((a, b) => Number(a[0] === "Other") - Number(b[0] === "Other") || b[1].length - a[1].length);
    return [`**${team}** (${sent.length} sent: ${sent.filter((o) => o.got === "alert").length} alerts)`, ...order.flatMap(([topic, os]) => [
      `- _${topic}_ (${os.length})`,
      ...os.map((o) => `  - ${o.got === "alert" ? "🔔 " : ""}${o.id}${o.got === o.expected ? "" : ` (answer key: ${o.expected})`}`),
    ])].join("\n");
  }).join("\n\n");
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
  /** Exam items the owner added from team votes, listed with how the judge did on each. */
  ownerItems?: string[];
  topics?: TopicCheck[];
}): string {
  const { scores, outcomes } = args;
  const misses = outcomes.filter((o) => o.got !== o.expected);
  return [
    `# Evals ${args.when}`,
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
    args.topics?.length
      ? `\n**Topic tags:** ${args.topics.filter((t) => t.hit).length}/${args.topics.length} items tagged with a fitting topic${args.topics.some((t) => !t.hit) ? `\n${args.topics.filter((t) => !t.hit).map((t) => `- ${t.id}: expected one of ${t.expected.join(" / ")}; got ${t.got.join(", ") || "no topic"}`).join("\n")}` : ""}`
      : "",
    ownerItemsSection(outcomes, args.ownerItems ?? []),
    "",
    "## How the digests would look",
    "",
    "What each team would have received in this eval run, grouped by topic as the digest groups it. A look, not a score.",
    "",
    digestPreview(outcomes),
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

/** One line per owner-added item: did the judge now give each team the owner's level? */
export function ownerItemResults(outcomes: Outcome[], ids: string[]) {
  return ids.map((id) => {
    const os = outcomes.filter((o) => o.id === id);
    return { id, graded: os.length > 0, agreed: os.length > 0 && os.every((o) => o.got === o.expected), outcomes: os };
  });
}

function ownerItemsSection(outcomes: Outcome[], ids: string[]): string {
  if (!ids.length) return "";
  const rows = ownerItemResults(outcomes, ids);
  return [
    "",
    `**Added by the owner from team votes:** ${rows.filter((r) => r.agreed).length}/${rows.length} now judged as the owner said`,
    ...rows.map((r) => `- ${r.id}: ${!r.graded ? "not graded in this run" : r.outcomes.map((o) => `${o.team} expected ${o.expected}, got ${o.got}`).join("; ")}`),
  ].join("\n");
}

export type Verdict = "baseline" | "no-baseline" | "better" | "worse" | "mixed" | "same";
export interface MetricChange { team: string; metric: "precision" | "recall"; before: number | null; after: number | null; delta: number | null }
export interface AnswerChange { id: string; team: string; expected: Level; before: Level | null; after: Level; why?: string }

/**
 * Compares the latest eval run with the baseline in plain terms: each team's precision and recall
 * moved up, down or not at all, and which answers changed. "Worse" follows `regressions`, so the
 * verdict and the red warning always agree.
 */
export function compareRuns(
  last: { when: string; scores: TeamScore[]; outcomes: Outcome[] },
  baseline: { when: string; scores: TeamScore[]; outcomes: Outcome[] } | null,
): { verdict: Verdict; changes: MetricChange[]; better: number; worse: number; answers: AnswerChange[]; newItems: string[] } {
  if (!baseline) return { verdict: "no-baseline", changes: [], better: 0, worse: 0, answers: [], newItems: [] };
  const changes: MetricChange[] = [];
  for (const c of last.scores) {
    const b = baseline.scores.find((x) => x.team === c.team);
    for (const metric of ["precision", "recall"] as const) {
      const before = b?.[metric] ?? null;
      const after = c[metric];
      changes.push({ team: c.team, metric, before, after, delta: before === null || after === null ? null : Math.round((after - before) * 100) });
    }
  }
  const worse = regressions(last.scores, baseline.scores).length;
  const better = changes.filter((c) => (c.delta ?? 0) > 0).length;
  const prev = new Map(baseline.outcomes.map((o) => [`${o.id}|${o.team}`, o]));
  const answers: AnswerChange[] = [];
  for (const o of last.outcomes) {
    const p = prev.get(`${o.id}|${o.team}`);
    if (!p || p.got === o.got) continue;
    answers.push({ id: o.id, team: o.team, expected: o.expected, before: p?.got ?? null, after: o.got, why: o.why });
  }
  const seen = new Set(baseline.outcomes.map((o) => o.id));
  const newItems = [...new Set(last.outcomes.map((o) => o.id).filter((id) => !seen.has(id)))];
  const verdict: Verdict = last.when === baseline.when ? "baseline" : worse && better ? "mixed" : worse ? "worse" : better ? "better" : "same";
  return { verdict, changes, better, worse, answers, newItems };
}
