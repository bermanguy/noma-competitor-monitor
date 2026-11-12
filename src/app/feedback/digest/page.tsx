import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, item, judgment, team } from "@/db/schema";
import { digestRatingToken } from "@/pipeline/slack";
import { submitDigestRatings } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Opened from the one "Rate these updates" link at the bottom of a digest. Each update gets its own
 * vote and optional reason, saved together. Nothing counts until Save is clicked.
 */
export default async function RateDigest({ searchParams }: { searchParams: Promise<{ ids?: string; t?: string; done?: string }> }) {
  const { ids: raw, t, done } = await searchParams;
  const ids = (raw ?? "").split(".").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length || t !== digestRatingToken(ids)) return <div className="card">This rating link is not valid.</div>;
  const rows = await db().select({ j: judgment, i: item, c: competitor, tm: team })
    .from(judgment).innerJoin(item, eq(judgment.itemId, item.id)).innerJoin(competitor, eq(item.competitorId, competitor.id))
    .innerJoin(team, eq(team.key, judgment.teamKey)).where(inArray(judgment.id, ids));
  const ordered = ids.map((id) => rows.find((r) => r.j.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  if (!ordered.length) return <div className="card">These updates no longer exist.</div>;
  const teamName = ordered[0]!.tm.name;
  if (done !== undefined) {
    return <div className="card"><h1>Thanks</h1><p>{Number(done) ? `${done} rating${done === "1" ? "" : "s"} saved.` : "Nothing was rated."} Ratings decide what {teamName} gets next time.</p></div>;
  }
  return (
    <div style={{ maxWidth: 720 }}>
      <h1>Rate today&apos;s {teamName} digest</h1>
      <p className="muted">Rate as many as you like; anything left on &quot;Skip&quot; is not counted. A reason helps most when something was not useful.</p>
      <form action={submitDigestRatings}>
        <input type="hidden" name="ids" value={ids.join(".")} />
        <input type="hidden" name="t" value={t} />
        {ordered.map(({ j, i, c }) => (
          <div key={j.id} className="card" style={{ marginBottom: 10 }}>
            <div className="muted">{c.name}</div>
            <strong><a href={i.url} target="_blank" rel="noreferrer">{i.title ?? i.url}</a></strong>
            <div style={{ marginTop: 4 }}>{j.why}</div>
            <div className="row" style={{ margin: "8px 0" }}>
              <label><input type="radio" name={`vote:${j.id}`} value="1" /> 👍 Useful</label>
              <label><input type="radio" name={`vote:${j.id}`} value="0" /> 👎 Not useful</label>
              <label className="muted"><input type="radio" name={`vote:${j.id}`} value="" defaultChecked /> Skip</label>
            </div>
            <input type="text" name={`reason:${j.id}`} placeholder="Why? (optional) For example: already knew, wrong team, too minor" />
          </div>
        ))}
        <button>Save ratings</button>
      </form>
    </div>
  );
}
