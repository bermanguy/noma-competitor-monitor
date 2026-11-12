import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, item, judgment, team } from "@/db/schema";
import { feedbackToken } from "@/pipeline/slack";
import { submitFeedback } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Opened from a Slack link. The link only pre-selects the answer; saving needs a click,
 * so link previews and accidental opens never count as votes.
 */
export default async function Feedback({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; useful?: string; done?: string }>;
}) {
  const { id } = await params;
  const { t, useful, done } = await searchParams;
  const jid = Number(id);
  if (!jid || t !== feedbackToken(jid)) return <div className="card">This feedback link is not valid.</div>;
  const [row] = await db().select({ j: judgment, i: item, c: competitor, tm: team })
    .from(judgment).innerJoin(item, eq(judgment.itemId, item.id)).innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(team, eq(team.key, judgment.teamKey)).where(eq(judgment.id, jid));
  if (!row) return <div className="card">This item no longer exists.</div>;
  if (done) return <div className="card"><h1>Thanks</h1><p>Your rating is saved. It is used to tune what {row.tm.name} receives.</p></div>;
  const yes = useful !== "0";
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="muted">{row.c.name} · for {row.tm.name}</div>
      <h1 style={{ marginTop: 4 }}>{row.i.title}</h1>
      <p>{row.j.why}</p>
      <form action={submitFeedback}>
        <input type="hidden" name="id" value={jid} />
        <input type="hidden" name="t" value={t} />
        <div className="row" style={{ margin: "12px 0" }}>
          <label><input type="radio" name="useful" value="1" defaultChecked={yes} /> Useful</label>
          <label><input type="radio" name="useful" value="0" defaultChecked={!yes} /> Not useful</label>
        </div>
        <textarea name="reason" placeholder={yes ? "Optional: what made it useful?" : "Why not? For example: already knew, wrong team, too minor, wrong facts"} />
        <button style={{ marginTop: 8 }}>Save rating</button>
      </form>
    </div>
  );
}
