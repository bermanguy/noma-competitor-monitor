import { z } from "zod";
import { config } from "../config";
import type { DB } from "../db/client";
import { GATE_SYSTEM, JUDGE_SYSTEM, QUOTE_SYSTEM, teamsBlock } from "../prompts/scaffold";
import { structuredCall } from "./llm";
import type { PageType } from "../db/schema";


export const GateResult = z.object({
  meaningful: z.boolean(),
  reason: z.string().describe("One sentence quoting the changed words"),
});

export async function gateChange(
  db: DB,
  runId: number | undefined,
  args: { competitor: string; url: string; removed: string; added: string },
) {
  const user = `Competitor: ${args.competitor}\nPage: ${args.url}\n<removed>\n${args.removed}\n</removed>\n<added>\n${args.added}\n</added>`;
  return structuredCall({
    db, runId, purpose: "gate", model: config.gateModel, system: GATE_SYSTEM, user, schema: GateResult, maxTokens: 1000,
  });
}

export const TeamJudgment = z.object({
  team: z.string(),
  level: z.enum(["alert", "digest", "log", "none"]),
  why: z.string(),
  evidence: z.array(z.string()),
  topics: z.array(z.string()),
});
export const JudgeResult = z.object({
  summary: z.string().describe("One factual sentence: what happened, in the source's tense"),
  sameStoryAs: z.number().int().nullable().describe("Id of the item in <earlier> that reports the same story, or null"),
  whatsNew: z.string().nullable().describe("When sameStoryAs is set: one sentence on what this item adds, or null if nothing"),
  judgments: z.array(TeamJudgment),
});
export type JudgeResult = z.infer<typeof JudgeResult>;

export interface JudgeInput {
  competitor: string;
  kind: "post" | "page_change";
  pageType?: PageType;
  url: string;
  title: string | null;
  publishedAt: Date | null;
  text: string;
  diff?: string | null;
  teams: { key: string; name: string; lens: string }[];
  /** Owner-maintained: what Noma sells, the level definitions, and guidance per page type. */
  company: string;
  levels: string;
  pageGuidance?: string;
  topics: { name: string; description: string }[];
  examples?: string;
  /** This competitor's recent items, so a repeat of a story already judged is recognised. */
  earlier?: EarlierItem[];
}

export interface EarlierItem {
  id: number;
  title: string | null;
  publishedAt: string | null;
  summary: string;
  /** Level each team got for it, e.g. { rnd: "alert" }. */
  levels: Record<string, string>;
}

export function earlierBlock(earlier: EarlierItem[]): string {
  return earlier
    .map((e) => `<item id="${e.id}" published="${e.publishedAt ?? "not stated"}">\nTitle: ${e.title ?? "(none)"}\nSummary: ${e.summary}\nTeams got: ${Object.entries(e.levels).map(([k, v]) => `${k} ${v}`).join(", ")}\n</item>`)
    .join("\n");
}

export function buildJudgeUser(i: JudgeInput): string {
  const guidance = i.kind === "page_change" && i.pageType && i.pageType !== "general" ? i.pageGuidance ?? "" : "";
  const body =
    i.kind === "page_change"
      ? `${guidance ? `<page_type>\n${guidance}\n</page_type>\n` : ""}This is a change to a page the competitor already had. Judge the change, using the page for context.\n<change>\n${i.diff}\n</change>\n<source>\n${i.text.slice(0, 30000)}\n</source>`
      : `<source>\n${i.text.slice(0, 40000)}\n</source>`;
  return [
    `<company>\n${i.company}\n</company>`,
    `<levels>\n${i.levels}\n</levels>`,
    `<teams>\n${teamsBlock(i.teams)}\n</teams>`,
    `<topics>\n${i.topics.map((t) => `- ${t.name}: ${t.description}`).join("\n")}\n</topics>`,
    i.examples ? `<rated_examples>\n${i.examples}\n</rated_examples>` : "",
    `<earlier>\n${i.earlier?.length ? earlierBlock(i.earlier) : "(none)"}\n</earlier>`,
    `Competitor: ${i.competitor}\nURL: ${i.url}\nTitle: ${i.title ?? "(none)"}\nPublished: ${i.publishedAt?.toISOString().slice(0, 10) ?? "not stated"}`,
    body,
    `Return one judgment per team key (${i.teams.map((t) => t.key).join(", ")}). Topics must be names from <topics>.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Matches the judge's team labels to team keys ("Product" or "R&D" count as the key). */
function teamKeysFixed(r: JudgeResult, teams: JudgeInput["teams"]): JudgeResult {
  const byLabel = new Map(teams.flatMap((t) => [[t.key.toLowerCase(), t.key], [t.name.toLowerCase(), t.key]] as const));
  return { ...r, judgments: r.judgments.map((j) => ({ ...j, team: byLabel.get(j.team.trim().toLowerCase()) ?? j.team })) };
}

const missingTeams = (r: JudgeResult, teams: JudgeInput["teams"]) => teams.filter((t) => !r.judgments.some((j) => j.team === t.key));

export async function judgeItem(db: DB, runId: number | undefined, i: JudgeInput, model = config.judgeModel): Promise<JudgeResult> {
  const call = async () => teamKeysFixed(await structuredCall({
    db, runId, purpose: "judge", model, system: JUDGE_SYSTEM, user: buildJudgeUser(i), schema: JudgeResult,
  }), i.teams);
  let r = await call();
  // A team left out of the answer would silently get nothing, so ask once more.
  if (missingTeams(r, i.teams).length) {
    const again = await call();
    if (missingTeams(again, i.teams).length < missingTeams(r, i.teams).length) r = again;
  }
  // Only an id that was actually offered counts as the same story.
  const known = r.sameStoryAs != null && (i.earlier ?? []).some((e) => e.id === r.sameStoryAs);
  return { ...r, sameStoryAs: known ? r.sameStoryAs : null, whatsNew: known ? r.whatsNew : null };
}

export const Requote = z.object({
  quotes: z.array(z.object({ team: z.string(), evidence: z.array(z.string()) })),
});

/** Second chance for quotes: asks only for exact sentences that support a decision already made. */
export async function requote(
  db: DB, runId: number | undefined,
  args: { source: string; asks: { team: string; level: string; why: string }[] },
  model = config.judgeModel,
): Promise<z.infer<typeof Requote>> {
  const user = [
    `<source>\n${args.source.slice(0, 40000)}\n</source>`,
    `For each decision below, the quotes you gave earlier were not found in <source>. Copy 1 to 3 phrases from <source> that support the reason, character for character, each at least 12 characters. Do not paraphrase, shorten or join sentences. If nothing in <source> supports it, return an empty list for that team.`,
    args.asks.map((a) => `<decision team="${a.team}" level="${a.level}">\n${a.why}\n</decision>`).join("\n"),
  ].join("\n\n");
  return structuredCall({
    db, runId, purpose: "requote", model, system: QUOTE_SYSTEM, user, schema: Requote, maxTokens: 1500,
  });
}
