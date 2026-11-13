import type { Level } from "@/db/schema";
import type { EditVerdict, TeamEditRow } from "@/eval/team-edit";
import { AutoRefresh } from "./AutoRefresh";
import { localTime } from "@/lib/time";

const NAME: Record<Level, string> = { alert: "Urgent", digest: "Worth knowing", log: "FYI", none: "Not relevant" };
const Tag = ({ level }: { level: Level }) => <span className={`lvl lvl-${level}`}>{NAME[level]}</span>;

export interface ItemInfo { competitor: string; title: string; url: string }

/**
 * The owner's view of their edit while it is checked on the golden set, and what to do if something
 * got worse. Everything is in plain words: which team, which post, what it would now get, and what the
 * answer key says.
 */
export function TeamEditCard({ edit, verdict, items, teamNames, canAnswer, total, actions }: {
  edit: TeamEditRow;
  verdict: EditVerdict | null;
  items: Map<string, ItemInfo>;
  teamNames: Record<string, string>;
  /** Teams whose answer key this viewer may correct (their own). */
  canAnswer: (teamKey: string) => boolean;
  total: number;
  actions: { decide: (f: FormData) => Promise<void>; answer: (f: FormData) => Promise<void> };
}) {
  const team = teamNames[edit.teamKey] ?? edit.teamKey;
  if (edit.status === "checking") {
    return (
      <div className="card edit-check">
        <AutoRefresh everyMs={8000} />
        <strong>Checking your edit on {total} test posts…</strong>
        <p className="muted">Started {localTime(edit.createdAt)}, about 2 minutes. Every test post is judged again with your new wording, for all three teams, and compared with the answers we agreed on. Nothing is live yet. You can leave this page: the result waits here.</p>
        <div className="progress"><span /></div>
      </div>
    );
  }
  if (edit.status === "failed") {
    return (
      <div className="card edit-check bad">
        <strong>The check could not finish.</strong> <span className="muted">Your edit was not saved. Press Save again in a minute.</span>
        <form action={actions.decide}><input type="hidden" name="id" value={edit.id} /><input type="hidden" name="op" value="discard" /><button className="secondary" style={{ marginTop: 8 }}>Dismiss</button></form>
      </div>
    );
  }
  if (!verdict) return null;
  if (edit.status === "saved" || edit.status === "saved_anyway") {
    return (
      <div className={`card edit-check ${edit.status === "saved" ? "good" : "warn"}`}>
        <strong>{edit.status === "saved" ? `Saved and live. Checked on ${total} test posts: nothing got worse for any team.` : "Saved anyway. The Builder was told in the ops channel."}</strong>
        {verdict.better.length > 0 && <p className="small"><span className="up">✓ Better with your edit:</span> {verdict.better.map((b) => `${items.get(b.id)?.competitor ?? b.id} for ${teamNames[b.team] ?? b.team}`).join(", ")}.</p>}
        <p className="muted small">It applies from the next check{edit.decidedAt ? `, saved at ${localTime(edit.decidedAt)}` : ""}.</p>
      </div>
    );
  }

  const short = (t: string) => (t.length > 80 ? t.slice(0, 78).trimEnd() + "…" : t);
  const byTeam = (rows: EditVerdict["worse"]) => [...new Set(rows.map((w) => w.team))].map((t) => ({ t, rows: rows.filter((w) => w.team === t) }));
  const table = (rows: EditVerdict["worse"]) => byTeam(rows).map(({ t, rows }) => {
    const own = canAnswer(t);
    const name = teamNames[t] ?? t;
    return (
      <div key={t} className="edit-team">
        <div className="edit-team-h"><strong>{name}</strong> · {rows.length} post{rows.length === 1 ? "" : "s"} worse{t !== edit.teamKey ? <span className="muted"> · {name} didn&apos;t change anything; your wording moved these</span> : null}</div>
        <table className="edit-table"><thead><tr><th>Test post</th><th>Today → with your edit</th><th>Answer key</th>{own && <th>Out of date?</th>}</tr></thead><tbody>
          {rows.map((w) => {
            const it = items.get(w.id);
            return (
              <tr key={w.id}>
                <td><span className="muted">{it?.competitor ?? ""}</span><br /><a href={it?.url} target="_blank" rel="noreferrer">{short(it?.title ?? w.id)}</a>{w.why && <div className="muted small">{w.why}</div>}</td>
                <td style={{ whiteSpace: "nowrap" }}><Tag level={w.before} /> → <Tag level={w.after} />{w.severe && <div className="down small">severe miss</div>}</td>
                <td><Tag level={w.expected} /></td>
                {own && <td><form action={actions.answer} className="row small" style={{ gap: 6 }}>
                  <input type="hidden" name="goldenId" value={w.id} /><input type="hidden" name="team" value={w.team} /><input type="hidden" name="edit" value={edit.id} />
                  <select name="level" defaultValue={w.after} style={{ width: "auto" }}>{(["alert", "digest", "log", "none"] as Level[]).map((l) => <option key={l} value={l}>{NAME[l]}</option>)}</select>
                  <button className="secondary">Make this the answer</button>
                </form></td>}
              </tr>
            );
          })}
        </tbody></table>
        {!own && <div className="muted small">Only {name}&apos;s owner can change {name}&apos;s answers.</div>}
      </div>
    );
  });

  const blocking = verdict.worse.filter((w) => verdict.blockingTeams.includes(w.team));
  const noise = verdict.worse.filter((w) => !verdict.blockingTeams.includes(w.team));
  return (
    <div className={`card edit-check ${verdict.ok ? "good" : "warn"}`}>
      {verdict.ok ? (
        <>
          <strong>Nothing got worse now. Your edit is ready to go live.</strong>
          <p className="muted">After your answer-key update, the check on {total} test posts finds nothing worse for any team.</p>
          <form action={actions.decide}><input type="hidden" name="id" value={edit.id} /><input type="hidden" name="op" value="save" /><button>Save</button></form>
        </>
      ) : (
        <>
          <strong>Not saved yet: your edit would make {blocking.length} test post{blocking.length === 1 ? "" : "s"} worse.</strong>
          <p className="muted">We judged all {total} test posts again with your new wording. These came out further from the answer key than with today&apos;s wording.{verdict.blockingTeams.some((t) => t !== edit.teamKey) ? ` One judge reads all three team descriptions together, so ${team}'s wording can move another team's answers too. That's why every team is checked.` : ""}</p>
          <div className="edit-rows">{table(blocking)}</div>
        </>
      )}
      {verdict.better.length > 0 && <p className="small" style={{ marginTop: 8 }}><span className="up">✓ Better with your edit:</span> {verdict.better.map((b) => `${items.get(b.id)?.competitor ?? b.id} for ${teamNames[b.team] ?? b.team}`).join(", ")}.</p>}
      {noise.length > 0 && (
        <details className="small"><summary className="muted">{noise.length} other answer{noise.length === 1 ? "" : "s"} moved one step, within normal variation (the judge varies a little between runs)</summary>
          <div className="edit-rows">{table(noise)}</div>
        </details>
      )}
      {!verdict.ok && (
        <div className="edit-choices three">
          <div><strong>A. Narrow your wording</strong><div className="muted small">Change the description below so it says exactly when this kind of post matters, then Save again. This is the usual fix.</div></div>
          <div><strong>B. Update the answer key</strong><div className="muted small">If a test post&apos;s expected answer is out of date for your team, change it above. You can only change your own team&apos;s answers.</div></div>
          <div><strong>C. Save anyway</strong><div className="muted small">The edit goes live as it is. The Builder is told in the ops channel; nobody has to approve it.</div>
            <form action={actions.decide} className="row" style={{ gap: 8, marginTop: 6 }}>
              <input type="hidden" name="id" value={edit.id} />
              <button name="op" value="anyway" className="secondary">Save anyway</button>
              <button name="op" value="discard" className="secondary">Discard my edit</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
