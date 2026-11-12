import type { ownerSuggestion, team } from "@/db/schema";
import { approveSuggestion, dismissSuggestionAction } from "../settings/actions";

/** A suggested update drafted from a change on Noma's own site. Nothing changes until the owner approves. */
export function SuggestionCard({ s, teams, currentCompany, back }: {
  s: typeof ownerSuggestion.$inferSelect; teams: (typeof team.$inferSelect)[]; currentCompany: string; back: string;
}) {
  const teamNames = (keys: string[]) => keys.map((k) => teams.find((x) => x.key === k)?.name ?? k).join(", ");
  return (
    <form action={approveSuggestion} className="card">
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="back" value={back} />
      <div className="task">
        <div className="icon">✎</div>
        <div className="stack">
          <div className="what">Noma&apos;s site changed. Should we update what the system knows about Noma?</div>
          <div>{s.whatChanged}</div>
          <div className="faint">Seen on <a href={s.pageUrl}>{s.pageUrl}</a> · {s.createdAt.toISOString().slice(0, 10)}</div>
          {s.company && (
            <div>
              <label><input type="checkbox" name="useCompany" value="1" defaultChecked /> <strong>Update &quot;What Noma sells&quot;</strong> to this (you can edit it first):</label>
              <textarea name="company" defaultValue={s.company} style={{ marginTop: 6, minHeight: 140 }} />
              <details><summary className="muted">Show the current version</summary><pre className="diff">{currentCompany}</pre></details>
            </div>
          )}
          {[...s.newTopics.map((t) => ({ ...t, kind: "New topic" })), ...s.changedTopics.map((t) => ({ ...t, kind: "Update topic" }))].map((t) => (
            <label key={t.kind + t.name} style={{ display: "block" }}>
              <input type="checkbox" name="topics" value={t.name} defaultChecked /> <strong>{t.kind}: {t.name}</strong>
              <span className="muted"> · {t.description} · matters to {teamNames(t.teamKeys)}</span>
            </label>
          ))}
          <div className="row">
            <button>Approve what is ticked</button>
            <button className="secondary" formAction={dismissSuggestionAction}>Dismiss</button>
          </div>
        </div>
      </div>
    </form>
  );
}
