import { db } from "@/db/client";
import { examItems } from "@/eval/owner-golden";
import { examState } from "@/eval/run";
import { formatReport } from "@/eval/score";
import { localDateTime, localDay, localTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Operator-only (under /ops): the last eval run as one Markdown file, for reading or for error analysis
 * with someone else. Adds each disagreeing item's title and the labeller's note to the report.
 */
export async function GET() {
  const { last, regressions } = await examState(db());
  if (!last) return new Response("No eval run yet.", { status: 404 });
  const golden = new Map((await examItems(db())).map((g) => [g.id, g]));
  const missed = [...new Set(last.outcomes.filter((o) => o.got !== o.expected).map((o) => o.id))];
  const report = formatReport({
    promptVersion: last.promptVersion, model: last.model, when: localDateTime(last.when), scores: last.scores,
    outcomes: last.outcomes, regressions, failed: last.failed, unlabelled: last.unlabelled, costUsd: last.costUsd, stories: last.stories, topics: last.topics,
    ownerItems: [...golden.values()].filter((g) => g.tags.includes("from-feedback")).map((g) => g.id),
  });
  const items = missed.map((id) => {
    const g = golden.get(id);
    return g ? `- **${id}**: ${g.competitor} · ${g.title ?? "(no title)"} · ${g.url}\n  Answer key ${JSON.stringify(g.expected)}. Labeller's note: ${g.note || "(none)"}` : `- **${id}**: no longer in the golden set`;
  });
  const body = `${report}\n\n## The items behind the disagreements\n\n${items.join("\n")}\n`;
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="evals-${localDay(last.when)}-${localTime(last.when).replace(":", "-")}.md"` },
  });
}
