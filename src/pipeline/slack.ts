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
  itemId?: number;
  /** The earlier item of the same story, when the judge linked one. */
  related?: { itemId: number; title: string; url: string } | null;
  storyNote?: string | null;
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

/** Alerts show up to three quotes. A digest entry is compact: one quote, with the feedback links beside it. */
function itemBlocks(i: SlackItem, compact = false) {
  const label = i.kind === "page_change" ? "Page change" : "New post";
  const date = i.publishedAt ? ` · published ${i.publishedAt.toISOString().slice(0, 10)}` : "";
  const canary = (i.isCanary ? " · TEST PAGE" : "") + (i.isBackfill ? " · published before monitoring started" : "");
  const quotes = (compact ? i.evidence.slice(0, 1) : i.evidence).map((q) => `> “${esc(q)}”`).join("\n").slice(0, 2500);
  const votes = `<${feedbackUrl(i.judgmentId, true)}|👍 Useful>   ·   <${feedbackUrl(i.judgmentId, false)}|👎 Not useful>`;
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${esc(i.competitor)}* · ${label}${date}${canary}\n*<${i.url}|${esc(i.title)}>*\n${esc(i.why)}`,
      },
    },
    ...(i.related
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: `↪ Follow-up to <${i.related.url}|${esc(i.related.title)}>${i.storyNote ? `. New: ${esc(i.storyNote)}` : ""}` }] }]
      : []),
    ...(compact
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: quotes ? `${quotes}\n${votes}` : votes }] }]
      : [
          ...(quotes ? [{ type: "context", elements: [{ type: "mrkdwn", text: quotes }] }] : []),
          { type: "context", elements: [{ type: "mrkdwn", text: votes }] },
        ]),
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

/**
 * Groups digest items that report the same story. The judge links an item to an earlier one of the
 * same competitor; items in one digest that share that root become one entry with several links.
 */
export function groupStories(items: SlackItem[]): SlackItem[][] {
  const root = (i: SlackItem) => i.related?.itemId ?? i.itemId ?? -i.judgmentId;
  const groups = new Map<number, SlackItem[]>();
  for (const i of items) groups.set(root(i), [...(groups.get(root(i)) ?? []), i]);
  for (const g of groups.values()) {
    // The original post leads; follow-ups go under it.
    g.sort((a, b) => Number(!!a.related) - Number(!!b.related));
  }
  return [...groups.values()];
}

function storyBlocks(group: SlackItem[]) {
  const [lead, ...rest] = group as [SlackItem, ...SlackItem[]];
  // The original sorts first, so a lead that is itself a follow-up keeps its "follow-up to" line.
  const leadBlocks = itemBlocks(lead, true);
  if (!rest.length) return leadBlocks;
  const also = rest.map((r) => `↪ Same story: <${r.url}|${esc(r.title)}>${r.storyNote ? ` · New: ${esc(r.storyNote)}` : " · nothing new"}`).join("\n");
  return [...leadBlocks, { type: "context", elements: [{ type: "mrkdwn", text: also.slice(0, 2900) }] }];
}

/** Slack refuses a message over 50 blocks, so a long digest is split into parts. Nothing is ever cut. */
export const MAX_BLOCKS = 48;

export interface DigestPart { payload: { text: string; blocks: unknown[] }; judgmentIds: number[] }

export function digestMessages(teamName: string, items: SlackItem[]): DigestPart[] {
  const stories = groupStories(items);
  const count = stories.length === items.length ? `${items.length}` : `${stories.length} ${stories.length === 1 ? "story" : "stories"}, ${items.length} posts`;
  const chunks: SlackItem[][][] = [[]];
  let used = 1; // the header
  for (const g of stories) {
    const size = storyBlocks(g).length + 1; // plus its divider
    if (used + size > MAX_BLOCKS && chunks[chunks.length - 1]!.length) { chunks.push([]); used = 1; }
    chunks[chunks.length - 1]!.push(g);
    used += size;
  }
  return chunks.map((chunk, n) => {
    const part = chunks.length > 1 ? ` · part ${n + 1} of ${chunks.length}` : "";
    return {
      payload: {
        text: `${teamName} digest: ${count}${part}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `${teamName} · competitor digest (${count})${part}` } },
          ...chunk.flatMap((g) => [{ type: "divider" }, ...storyBlocks(g)]),
        ],
      },
      judgmentIds: chunk.flat().map((i) => i.judgmentId),
    };
  });
}

export async function postToSlack(webhookEnv: string, payload: unknown): Promise<void> {
  const url = process.env[webhookEnv];
  if (!url) throw new Error(`${webhookEnv} is not set`);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Slack returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
