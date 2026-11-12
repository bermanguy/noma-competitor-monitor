import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, goldenItem, ownerSuggestion, source, team, topic } from "@/db/schema";
import { GoldenItem } from "@/eval/golden";
import { sourceHealth } from "@/pipeline/health";
import { addCompetitor, addToExamAction, addTopic, addWatchedPage, approveSuggestion, dismissSuggestionAction, removeTopic, restoreOwnerTextAction, saveOwnerText, setCompetitorActive, updateTeam, updateTopic } from "./actions";
import { toReview } from "@/eval/owner-golden";
import { currentViewer } from "@/lib/viewer";
import { canEditTeam } from "@/lib/view-as";
import { getOwnerTexts, OWNER_TEXTS, ownerTextHistoryFor, type OwnerTextKey } from "@/lib/owner-text";

export const dynamic = "force-dynamic";

const HEALTH_TEXT = { healthy: "Healthy", failing: "Needs attention", quiet: "Unusually quiet", new: "Starting" } as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ added?: string; error?: string }> }) {
  const { added, error } = await searchParams;
  const d = db();
  const comps = await d.select().from(competitor).orderBy(competitor.name);
  const srcs = await d.select().from(source).where(eq(source.active, true));
  const teams = await d.select().from(team).orderBy(team.id);
  const topics = await d.select().from(topic).where(eq(topic.active, true)).orderBy(topic.id);
  const ownerTexts = await getOwnerTexts(d);
  const history = Object.fromEntries(await Promise.all((Object.keys(OWNER_TEXTS) as OwnerTextKey[]).map(async (k) => [k, await ownerTextHistoryFor(d, k)] as const)));
  const viewer = await currentViewer();
  // An owner reviews only the votes of their own team; the builder sees all of them.
  const review = (await toReview(d))
    .map((r) => ({ ...r, votes: r.votes.filter((v) => canEditTeam(viewer, v.team)) }))
    .filter((r) => r.votes.length > 0);
  // Exam items the owners already added; the same form updates the answer.
  const inExam = (await d.select().from(goldenItem).orderBy(desc(goldenItem.createdAt))).map((r) => ({ itemId: r.fromItemId, g: GoldenItem.parse(r.data) }));
  const pending = await d.select().from(ownerSuggestion).where(eq(ownerSuggestion.status, "pending")).orderBy(desc(ownerSuggestion.id));

  return (
    <>
      <h1>Competitors and topics</h1>
      <p className="lead">Decide who we watch, what we look for, and what each team cares about. Changes apply from the next check.</p>
      {added && <div className="notice">{added}</div>}
      {error && <div className="notice" style={{ borderColor: "#f3c1c1", background: "#fff3f3" }}>{error}</div>}
      {pending.length > 0 && (
        <div className="notice"><strong>Noma&apos;s site changed.</strong> {pending.length === 1 ? "One suggested update is" : `${pending.length} suggested updates are`} waiting for your approval. <a href="#suggestions">Review</a></div>
      )}

      {review.length > 0 && (
        <>
          <h2 id="review">To review: items a team marked not useful ({review.length})</h2>
          <p className="muted">Pick the level each team should have got. &quot;Add to the exam&quot; saves your answer as an exam item, so every later exam checks the judge against it.</p>
          {review.map((r) => (
            <form key={r.itemId} action={addToExamAction} className="card">
              <input type="hidden" name="itemId" value={r.itemId} />
              <div className="muted">{r.competitor}{r.isTest && <span className="chip lv-log" style={{ marginLeft: 8 }}>test page</span>}</div>
              <strong><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></strong>
              {r.votes.map((v, n) => (
                <div key={n} className="team">
                  <span className={`chip lv-${v.level}`}>{teams.find((t) => t.key === v.team)?.name ?? v.team} got {v.level}</span>{" "}
                  <span className="muted">Judge: {v.why}</span>
                  <blockquote>Not useful{v.reason ? `: ${v.reason}` : " (no reason given)"}</blockquote>
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                {teams.map((t) => (
                  <label key={t.key}>{t.name}{" "}
                    <select name={`level:${t.key}`} defaultValue={r.levels[t.key] ?? "none"} style={{ width: "auto" }}>
                      {["alert", "digest", "log", "none"].map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <input type="text" name="note" placeholder="Why these levels (optional, kept with the exam item)" style={{ marginTop: 8 }} />
              <button style={{ marginTop: 8 }}>Add to the exam</button>
            </form>
          ))}
        </>
      )}

      {inExam.length > 0 && (
        <details className="card" style={{ marginTop: 12 }}>
          <summary><strong>In the exam from team votes ({inExam.length})</strong> <span className="muted">· change an answer you already added</span></summary>
          {inExam.map(({ itemId, g }) => (
            <form key={itemId} action={addToExamAction} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <input type="hidden" name="itemId" value={itemId} />
              <div className="muted">{g.competitor}</div>
              <strong><a href={g.url} target="_blank" rel="noreferrer">{g.title ?? g.url}</a></strong>
              <div className="row" style={{ marginTop: 8 }}>
                {teams.map((t) => (
                  <label key={t.key}>{t.name}{" "}
                    <select name={`level:${t.key}`} defaultValue={(g.expected as Record<string, string> | null)?.[t.key] ?? "none"} style={{ width: "auto" }}>
                      {["alert", "digest", "log", "none"].map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <input type="text" name="note" defaultValue={g.note} placeholder="Why these levels" style={{ marginTop: 8 }} />
              <button className="secondary" style={{ marginTop: 8 }}>Update the answer</button>
            </form>
          ))}
        </details>
      )}

      <h2>Competitors</h2>
      <table>
        <thead><tr><th>Competitor</th><th>What we watch</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {comps.map((c) => {
            const mine = srcs.filter((s) => s.competitorId === c.id);
            const worst = mine.map((s) => sourceHealth(s).health).sort((a, b) => rank(a) - rank(b))[0] ?? "new";
            return (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td><strong>{c.name}</strong><div className="muted">{c.domain}</div></td>
                <td className="muted">{mine.map((s) => s.label + (s.pageType === "pricing" ? " (pricing)" : "")).join(", ") || "nothing found yet"}</td>
                <td><span className={`chip h-${worst}`}>{c.active ? HEALTH_TEXT[worst] : "Paused"}</span></td>
                <td>
                  <form action={setCompetitorActive}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                    <button className="secondary">{c.active ? "Pause" : "Resume"}</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card" style={{ marginTop: 12 }}>
        <form action={addCompetitor} className="row">
          <div style={{ flex: 1 }}><input type="text" name="name" placeholder="Company name, e.g. HiddenLayer" required /></div>
          <div style={{ flex: 1 }}><input type="text" name="domain" placeholder="Website, e.g. hiddenlayer.com" required /></div>
          <button>Add competitor</button>
        </form>
        <div className="muted" style={{ marginTop: 6 }}>We find their blog or news feed and homepage automatically. It takes a few seconds.</div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <form action={addWatchedPage} className="row">
          <select name="competitorId" style={{ width: "auto" }}>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <div style={{ flex: 2 }}><input type="text" name="url" placeholder="Page to watch, e.g. https://example.com/pricing" required /></div>
          <div style={{ flex: 1 }}><input type="text" name="label" placeholder="Name, e.g. Pricing" /></div>
          <select name="pageType" style={{ width: "auto" }}>
            <option value="general">General page</option>
            <option value="pricing">Pricing page</option>
          </select>
          <button>Watch page</button>
        </form>
        <div className="muted" style={{ marginTop: 6 }}>General pages report meaningful wording changes. Pricing pages compare each plan's monthly and yearly price and features, and report exactly what changed.</div>
      </div>

      <h2>Topics to watch</h2>
      <table>
        <thead><tr><th>Topic</th><th>Matters to</th><th></th></tr></thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id}>
              <td>
                <details>
                  <summary><strong>{t.name}</strong><div className="muted">{t.description}</div></summary>
                  <form action={updateTopic} style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="text" name="name" defaultValue={t.name} required />
                    <input type="text" name="description" defaultValue={t.description} />
                    <div className="row">
                      {teams.map((x) => <label key={x.key}><input type="checkbox" name="teams" value={x.key} defaultChecked={t.teamKeys.includes(x.key)} /> {x.name}</label>)}
                      <button className="secondary" style={{ marginLeft: "auto" }}>Save topic</button>
                    </div>
                  </form>
                </details>
              </td>
              <td>{t.teamKeys.map((k) => teams.find((x) => x.key === k)?.name ?? k).join(", ")}</td>
              <td><form action={removeTopic}><input type="hidden" name="id" value={t.id} /><button className="secondary">Remove</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card" style={{ marginTop: 12 }}>
        <form action={addTopic}>
          <div className="grid2">
            <input type="text" name="name" placeholder="Topic, e.g. Browser agents" required />
            <input type="text" name="description" placeholder="In a few words, what counts" />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Matters to:</span>
            {teams.map((t) => <label key={t.key}><input type="checkbox" name="teams" value={t.key} /> {t.name}</label>)}
            <button style={{ marginLeft: "auto" }}>Add topic</button>
          </div>
        </form>
      </div>

      {pending.length > 0 && <h2 id="suggestions">Suggested updates from Noma&apos;s site</h2>}
      {pending.map((s) => (
        <form key={s.id} action={approveSuggestion} className="card" style={{ marginBottom: 12 }}>
          <input type="hidden" name="id" value={s.id} />
          <div>{s.whatChanged}</div>
          <div className="muted">Seen on <a href={s.pageUrl}>{s.pageUrl}</a> · {s.createdAt.toISOString().slice(0, 10)}</div>
          {s.company && (
            <div style={{ marginTop: 10 }}>
              <label><input type="checkbox" name="useCompany" value="1" defaultChecked /> <strong>Update &quot;What Noma sells&quot;</strong> to this (you can edit it first):</label>
              <textarea name="company" defaultValue={s.company} style={{ marginTop: 6, minHeight: 150 }} />
              <details><summary className="muted">Show the current version</summary><pre style={{ whiteSpace: "pre-wrap" }}>{ownerTexts.company}</pre></details>
            </div>
          )}
          {[...s.newTopics.map((t) => ({ ...t, kind: "New topic" })), ...s.changedTopics.map((t) => ({ ...t, kind: "Update topic" }))].map((t) => (
            <label key={t.kind + t.name} style={{ display: "block", marginTop: 8 }}>
              <input type="checkbox" name="topics" value={t.name} defaultChecked /> <strong>{t.kind}: {t.name}</strong>
              <span className="muted"> · {t.description} · matters to {t.teamKeys.map((k) => teams.find((x) => x.key === k)?.name ?? k).join(", ")}</span>
            </label>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <button>Approve what is ticked</button>
            <button className="secondary" formAction={dismissSuggestionAction}>Dismiss</button>
          </div>
        </form>
      ))}

      <h2>What Noma sells and what the levels mean</h2>
      <p className="muted">Used in every judgment. Keep these current when Noma's products or priorities change.</p>
      <div className="grid2">
        {(Object.keys(OWNER_TEXTS) as OwnerTextKey[]).map((k) => (
          <form key={k} action={saveOwnerText} className="card">
            <input type="hidden" name="key" value={k} />
            <strong>{OWNER_TEXTS[k].title}</strong>
            <div className="muted">{OWNER_TEXTS[k].help}</div>
            <textarea name="text" defaultValue={ownerTexts[k]} style={{ marginTop: 8, minHeight: 150 }} />
            <button style={{ marginTop: 8 }}>Save</button>
            {history[k]!.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted">Earlier versions ({history[k]!.length})</summary>
                {history[k]!.map((h) => (
                  <div key={h.id} style={{ marginTop: 6 }}>
                    <div className="muted">Replaced {h.replacedAt.toISOString().slice(0, 16).replace("T", " ")} by {h.replacedBy === "suggestion" ? "an approved suggestion" : h.replacedBy === "restore" ? "a restore" : "an edit"}</div>
                    <pre style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{h.value}</pre>
                    <button className="secondary" formAction={restoreOwnerTextAction} name="id" value={h.id}>Restore this version</button>
                  </div>
                ))}
              </details>
            )}
          </form>
        ))}
      </div>

      <h2>What each team cares about</h2>
      <p className="muted">This is the instruction the system follows when it decides what matters to each team. Write it the way you would brief a new analyst.</p>
      <div className="grid2">
        {[...teams].sort((a, b) => Number(canEditTeam(viewer, b.key)) - Number(canEditTeam(viewer, a.key))).map((t) => canEditTeam(viewer, t.key) ? (
          <form key={t.key} action={updateTeam} className="card">
            <input type="hidden" name="key" value={t.key} />
            <div className="row"><strong>{t.name}</strong>
              <select name="noise" defaultValue={t.noise} style={{ width: "auto", marginLeft: "auto" }}>
                <option value="normal">Urgent now + daily digest</option>
                <option value="quiet">Urgent only</option>
              </select>
            </div>
            <textarea name="lens" defaultValue={t.lens} style={{ marginTop: 8, minHeight: 150 }} />
            <button style={{ marginTop: 8 }}>Save</button>
          </form>
        ) : (
          <div key={t.key} className="card" style={{ opacity: 0.75 }}>
            <div className="row"><strong>{t.name}</strong><span className="muted" style={{ marginLeft: "auto" }}>Owned by another team&apos;s owner</span></div>
            <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{t.lens}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function rank(h: string) {
  return ({ failing: 0, quiet: 1, new: 2, healthy: 3 } as Record<string, number>)[h] ?? 4;
}
