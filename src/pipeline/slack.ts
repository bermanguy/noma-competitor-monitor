import { createHmac } from "node:crypto";
import { config } from "../config";

export interface SlackItem {
  judgmentId: number;
  competitor: string;
  title: string;
  url: string;
  kind: "post" | "page_change";
  level: string;
  why: string;
  evidence: string[];
  publishedAt: Date | null;
  isCanary: boolean;
  isBackfill?: boolean;
}

/** Feedback links are signed so a link only rates the judgment it was sent with. */
export function feedbackToken(judgmentId: number): string {
  const secret = process.env.FEEDBACK_SECRET ?? "dev-only-secret";
  return createHmac("sha256", secret).update(String(judgmentId)).digest("hex").slice(0, 20);
}

export function feedbackUrl(judgmentId: number, useful: boolean): string {
  return `${config.publicUrl}/feedback/${judgmentId}?t=${feedbackToken(judgmentId)}&useful=${useful ? 1 : 0}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function itemBlocks(i: SlackItem) {
  const label = i.kind === "page_change" ? "Page change" : "New post";
  const date = i.publishedAt ? ` · published ${i.publishedAt.toISOString().slice(0, 10)}` : "";
  const canary = (i.isCanary ? " · TEST PAGE" : "") + (i.isBackfill ? " · published before monitoring started" : "");
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${esc(i.competitor)}* · ${label}${date}${canary}\n*<${i.url}|${esc(i.title)}>*\n${esc(i.why)}`,
      },
    },
    ...(i.evidence.length
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: i.evidence.map((q) => `> “${esc(q)}”`).join("\n").slice(0, 2900) }] }]
      : []),
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `<${feedbackUrl(i.judgmentId, true)}|👍 Useful>   ·   <${feedbackUrl(i.judgmentId, false)}|👎 Not useful>` },
      ],
    },
  ];
}

export function alertMessage(teamName: string, i: SlackItem) {
  return {
    text: `${i.competitor}: ${i.title}`,
    blocks: [
      { type: "context", elements: [{ type: "mrkdwn", text: `🔔 *For ${esc(teamName)}* · needs attention today` }] },
      ...itemBlocks(i),
    ],
  };
}

export function digestMessage(teamName: string, items: SlackItem[]) {
  return {
    text: `${teamName} digest: ${items.length} competitor updates`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${teamName} · competitor digest (${items.length})` } },
      ...items.flatMap((i) => [{ type: "divider" }, ...itemBlocks(i)]),
    ].slice(0, 50),
  };
}

export async function postToSlack(webhookEnv: string, payload: unknown): Promise<void> {
  const url = process.env[webhookEnv];
  if (!url) throw new Error(`${webhookEnv} is not set`);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Slack returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
