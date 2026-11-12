import { db } from "@/db/client";
import { loadGolden } from "@/eval/golden";
import { examState } from "@/eval/run";
import { formatReport } from "@/eval/score";

export const dynamic = "force-dynamic";

/**
 * Operator-only (under /ops): the last exam as one Markdown file, for reading or for error analysis
 * with someone else. Adds each disagreeing item's title and the labeller's note to the report.
 */
export async function GET() {
  const { last, regressions } = await examState(db());
  if (!last) return new Response("No exam has been run yet.", { status: 404 });
  const golden = new Map(loadGolden().map((g) => [g.id, g]));
  const missed = [...new Set(last.outcomes.filter((o) => o.got !== o.expected).map((o) => o.id))];
  const report = formatReport({
    promptVersion: last.promptVersion, model: last.model, when: last.when.slice(0, 16).replace("T", " "), scores: last.scores,
    outcomes: last.outcomes, regressions, failed: last.failed, unlabelled: last.unlabelled, costUsd: last.costUsd, stories: last.stories,
  });
  const items = missed.map((id) => {
    const g = golden.get(id);
    return g ? `- **${id}**: ${g.competitor} · ${g.title ?? "(no title)"} · ${g.url}\n  Answer key ${JSON.stringify(g.expected)}. Labeller's note: ${g.note || "(none)"}` : `- **${id}**: no longer in the golden set`;
  });
  const body = `${report}\n\n## The items behind the disagreements\n\n${items.join("\n")}\n`;
  return new Response(body, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="exam-${last.when.slice(0, 16).replace(/[:T]/g, "-")}.md"` },
  });
}
