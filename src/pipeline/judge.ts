import { z } from "zod";
import { config } from "../config";
import type { DB } from "../db/client";
import { GATE_SYSTEM, JUDGE_SYSTEM, teamsBlock } from "../prompts/scaffold";
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
    `Competitor: ${i.competitor}\nURL: ${i.url}\nTitle: ${i.title ?? "(none)"}\nPublished: ${i.publishedAt?.toISOString().slice(0, 10) ?? "not stated"}`,
    body,
    `Return one judgment per team key (${i.teams.map((t) => t.key).join(", ")}). Topics must be names from <topics>.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function judgeItem(db: DB, runId: number | undefined, i: JudgeInput, model = config.judgeModel) {
  return structuredCall({
    db, runId, purpose: "judge", model, system: JUDGE_SYSTEM, user: buildJudgeUser(i), schema: JudgeResult,
  });
}
