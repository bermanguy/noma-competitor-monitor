import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, goldenItem, ownerSuggestion, source, team, topic } from "@/db/schema";
import { GoldenItem } from "@/eval/golden";
import { sourceHealth } from "@/pipeline/health";
import { archiveCompetitorAction, addPerson, addToExamAction, addTopic, addWatchedPage, approveSuggestion, dismissSuggestionAction, removePerson, removeTopic, restoreOwnerTextAction, saveOwnerText, setCompetitorActive, tryLensAction, updateTeam, updateTopic } from "../actions";
import { toReview } from "@/eval/owner-golden";
import { currentViewer } from "@/lib/viewer";
import { BUILDER, ROLE_HINT, ROLE_NAME, canEditTeam, canManagePeople, type Role } from "@/lib/view-as";
import { allViewers } from "@/lib/viewer";
import { previewDigest } from "@/pipeline/preview";
import { SlackMessage } from "@/components/SlackMessage";
import { TryLens } from "@/components/TryLens";
import { AddCompetitorWizard } from "@/components/AddCompetitorWizard";
import { getOwnerTexts, OWNER_TEXTS, ownerTextHistoryFor, type OwnerTextKey } from "@/lib/owner-text";
import { notFound } from "next/navigation";
import { SETTINGS_SECTIONS, subLabel, type SettingsSection } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** One line under each page title. */
const LEAD: Record<SettingsSection, string> = {
  review: "Items a team marked not useful. Pick the level each team should have got.",
  competitors: "Who we watch, and which of their pages. Changes apply from the next check.",
  topics: "What we look for in every post and page change, and which teams each topic matters to.",
  company: "Used in every judgment. Keep it current when Noma's products or positioning change.",
  levels: "What each level means. The judge uses these to decide what is sent now, what goes in the digest and what is only recorded.",
  pricing: "Added to the judgment for pricing page changes.",
  teams: "The instruction the system follows when it decides what matters to each team. Write it the way you would brief a new analyst.",
  suggestions: "When Noma's own site changes, we suggest updates to what Noma sells and to the topics. Nothing changes until you approve it.",
  people: "Who is on each team. Owners add and remove people in their own team, without waiting for the Builder.",
  preview: "The next Slack message your team gets, exactly as it will look. Fine-tune it here, then save.",
};
const TEXT_KEY: Partial<Record<SettingsSection, OwnerTextKey>> = { company: "company", levels: "levels", pricing: "page.pricing" };

const HEALTH_TEXT = { healthy: "Healthy", failing: "Needs attention", quiet: "Unusually quiet", new: "Starting" } as const;

export default async function Settings({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ added?: string; error?: string; team?: string }> }) {
  const { section: raw } = await params;
  if (!(SETTINGS_SECTIONS as readonly string[]).includes(raw)) notFound();
  const section = raw as SettingsSection;
  const on = (s: SettingsSection) => section === s;
  const { added, error, team: teamParam } = await searchParams;
  const d = db();
  const allComps = await d.select().from(competitor).orderBy(competitor.name);
  const comps = allComps.filter((c) => !c.archivedAt);
  const removed = allComps.filter((c) => c.archivedAt);
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
  const people = on("people") ? await allViewers(d) : [];
  // The owner previews their own team; the builder picks one.
  const previewTeam = on("preview") ? teams.find((t) => t.key === (viewer.role === "builder" ? teamParam : viewer.team)) ?? teams[0] : undefined;
  const preview = previewTeam ? await previewDigest(d, previewTeam.key) : undefined;
  const pending = await d.select().from(ownerSuggestion).where(eq(ownerSuggestion.status, "pending")).orderBy(desc(ownerSuggestion.id));

  return (
    <>
      <h1>{subLabel("setup", section)}</h1>
      <p className="lead">{LEAD[section]}</p>
      {added && <div className="notice">{added}</div>}
      {error && <div className="notice" style={{ borderColor: "#f3c1c1", background: "#fff3f3" }}>{error}</div>}
      {pending.length > 0 && !on("suggestions") && (
        <div className="notice"><strong>Noma&apos;s site changed.</strong> {pending.length === 1 ? "One suggested update is" : `${pending.length} suggested updates are`} waiting for your approval. <a href="/settings/suggestions">Review</a></div>
      )}

      {on("review") && review.length === 0 && <div className="card muted">Nothing to review. When a team marks an item not useful in Slack, it shows up here.</div>}
      {on("review") && review.length > 0 && (
        <>
          <p className="muted">&quot;Add to the exam&quot; saves your answer as an exam item, so every later exam checks the judge against it.</p>
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

      {on("review") && inExam.length > 0 && (
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

      {on("competitors") && (<>
      <AddCompetitorWizard />
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
                <td>
                  <span className={`chip h-${worst}`}>{c.active ? HEALTH_TEXT[worst] : "Paused"}</span>
                  {c.active && (worst === "failing" || worst === "quiet") && (() => {
                    const bad = mine.filter((s) => sourceHealth(s).health === worst).map((s) => s.label).join(", ");
                    return (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {worst === "failing" ? `${bad}: we can't read it right now.` : `${bad}: no new posts for a while.`}{" "}
                        {viewer.role === "builder"
                          ? <a href="/ops/sources">Fix in Builder › Sources</a>
                          : "The Builder was alerted in Slack. Nothing for you to do."}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <form action={setCompetitorActive}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                    <button className="secondary">{c.active ? "Pause" : "Resume"}</button>
                  </form>
                  <form action={archiveCompetitorAction} style={{ marginTop: 4 }}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="archived" value="1" />
                    <button className="secondary">Remove</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {removed.length > 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          Removed (history kept):{" "}
          {removed.map((c) => (
            <form key={c.id} action={archiveCompetitorAction} style={{ display: "inline", marginRight: 8 }}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value="0" />
              {c.name} <button className="secondary">Restore</button>
            </form>
          ))}
        </div>
      )}
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

      </>)}

      {on("topics") && (<>
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

      </>)}

      {on("suggestions") && pending.length === 0 && <div className="card muted">No suggestions waiting. We check Noma&apos;s site on every run.</div>}
      {on("suggestions") && pending.map((s) => (
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

      {TEXT_KEY[section] && (
      <div>
        {[TEXT_KEY[section]!].map((k) => (
          <form key={k} action={saveOwnerText} className="card">
            <input type="hidden" name="key" value={k} />
            <textarea name="text" defaultValue={ownerTexts[k]} style={{ minHeight: 320 }} />
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
      )}

      {on("teams") && (
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
      )}

      {on("people") && (
        <>
          <div className="roles">
            {(["builder", "owner", "member"] as Role[]).map((r) => (
              <div key={r} className={`role-card${viewer.role === r ? " me" : ""}`}>
                <strong>{ROLE_NAME[r]}</strong>{viewer.role === r && <span className="you">You</span>}
                <p>{ROLE_HINT[r]}</p>
              </div>
            ))}
          </div>
          <div className="people-row"><span className="avatar sm" style={{ background: "#55e0ff" }}>{BUILDER.name[0]}</span><strong>{BUILDER.name}</strong><span className="muted">Builder · runs the system for every team</span></div>
          {[...teams].sort((a, b) => Number(canManagePeople(viewer, b.key)) - Number(canManagePeople(viewer, a.key))).map((t) => {
            const mine = canManagePeople(viewer, t.key);
            const list = people.filter((p) => p.team === t.key).sort((a, b) => Number(a.role !== "owner") - Number(b.role !== "owner"));
            return (
              <div key={t.key} className={`card people${mine ? "" : " ro"}`}>
                <div className="row"><strong>{t.name}</strong><span className="muted" style={{ marginLeft: "auto" }}>{mine ? (viewer.role === "builder" ? "You can manage every team" : "Your team") : "Managed by its owners"}</span></div>
                {list.map((p) => (
                  <div key={p.key} className="people-row">
                    <span className={`role-pill r-${p.role}`}>{ROLE_NAME[p.role]}</span>
                    <strong>{p.name}</strong><span className="muted">{p.title}</span>
                    {p.key === viewer.key && <span className="you">You</span>}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <a className="muted" href={`/view-as?as=${p.key}&next=/`}>View as</a>
                      {mine && p.key !== viewer.key && (
                        <form action={removePerson}><input type="hidden" name="key" value={p.key} /><button className="link-btn">Remove</button></form>
                      )}
                    </span>
                  </div>
                ))}
                {list.length === 0 && <div className="muted" style={{ padding: "6px 0" }}>Nobody yet.</div>}
                {mine && (
                  <form action={addPerson} className="people-add">
                    <input type="hidden" name="team" value={t.key} />
                    <input name="name" placeholder="Name" required aria-label="Name" />
                    <input name="title" placeholder="Job title (optional)" aria-label="Job title" />
                    <select name="role" defaultValue="member" aria-label="Role" style={{ width: "auto" }}>
                      <option value="member">Member: reads {t.name}&apos;s changes</option>
                      <option value="owner">Owner: also sets up {t.name}</option>
                    </select>
                    <button>Add to {t.name}</button>
                  </form>
                )}
              </div>
            );
          })}
          <p className="muted">Members get {"their team's"} updates in Slack, and can open the Changes page to see them all in one place. There are no invites yet: everyone added here appears in the &quot;View as&quot; menu.</p>
        </>
      )}

      {on("preview") && previewTeam && preview && (
        <>
          {viewer.role === "builder" && (
            <div className="seg" style={{ marginBottom: 14 }}>
              {teams.map((t) => <a key={t.key} href={`/settings/preview?team=${t.key}`} className={t.key === previewTeam.key ? "on" : ""}>{t.name}</a>)}
            </div>
          )}
          <div className="preview-grid">
            <div>
              <div className="preview-h">
                {preview.mode === "next" && <><strong>{previewTeam.name}&apos;s next digest</strong> · {preview.storyCount} {preview.storyCount === 1 ? "update" : "updates"}, goes out {preview.when}</>}
                {preview.mode === "last" && <><strong>Nothing new is waiting.</strong> This is the last digest {previewTeam.name} got{preview.lastSentAt ? `, on ${preview.lastSentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}.</>}
                {preview.mode === "empty" && <><strong>Nothing to preview yet.</strong> The first digest appears here once a change worth knowing is found.</>}
              </div>
              {preview.quiet && <div className="notice">{previewTeam.name} is set to urgent only, so no daily digest is sent. <a href="/settings/teams">Change it</a></div>}
              <div className="slack-frame">
                <div className="slack-chan">Slack · {previewTeam.name}&apos;s channel</div>
                {preview.parts.map((p, n) => <SlackMessage key={n} payload={p} time={preview.mode === "next" ? "next digest" : undefined} />)}
                {preview.parts.length === 0 && <div className="muted" style={{ padding: 16 }}>No message yet.</div>}
              </div>
              {preview.alerts.length > 0 && (
                <>
                  <div className="preview-h" style={{ marginTop: 16 }}><strong>Also going out right away</strong> · {preview.alerts.length} urgent, at the next check</div>
                  <div className="slack-frame">{preview.alerts.map((p, n) => <SlackMessage key={n} payload={p} />)}</div>
                </>
              )}
            </div>
            <div>
              {canEditTeam(viewer, previewTeam.key)
                ? <TryLens teamKey={previewTeam.key} teamName={previewTeam.name} lens={previewTeam.lens} tryAction={tryLensAction} saveAction={updateTeam} />
                : <div className="card muted">Only {previewTeam.name}&apos;s owner can fine-tune it.</div>}
              <div className="card muted" style={{ fontSize: 13 }}>
                <strong style={{ color: "var(--fg)" }}>What else shapes this message</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li><a href="/settings/topics">Topics</a> decide the sections, in their order.</li>
                  <li><a href="/settings/levels">What the levels mean</a> decides urgent, digest or FYI.</li>
                  <li>Your team&apos;s 👎 votes land in <a href="/settings/review">To review</a>.</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function rank(h: string) {
  return ({ failing: 0, quiet: 1, new: 2, healthy: 3 } as Record<string, number>)[h] ?? 4;
}
