import { desc, eq } from "drizzle-orm";
import { localDate, localDateTime, localDay, localShort } from "@/lib/time";
import { db } from "@/db/client";
import { competitor, goldenItem, ownerSuggestion, source, team, topic } from "@/db/schema";
import { GoldenItem } from "@/eval/golden";
import { addPerson, approveSuggestion, dismissSuggestionAction, removePerson, restoreOwnerTextAction, saveOwnerText, tryLensAction, updateTeam, decideTeamEdit, setTeamAnswer } from "../actions";
import { toReview } from "@/eval/owner-golden";
import { currentViewer } from "@/lib/viewer";
import { BUILDER, ROLE_HINT, ROLE_NAME, canEditTeam, canManagePeople, type Role } from "@/lib/view-as";
import { allViewers } from "@/lib/viewer";
import { previewDigest } from "@/pipeline/preview";
import { SlackMessage } from "@/components/SlackMessage";
import { TryLens } from "@/components/TryLens";
import { TeamEditCard } from "@/components/TeamEditCard";
import { editToShow, verdictFor } from "@/eval/team-edit";
import { examItems, goldenAnswers } from "@/eval/owner-golden";
import type { EvalResult } from "@/eval/run";
import { CompetitorsSetup } from "@/components/setup/CompetitorsSetup";
import { TopicsSetup } from "@/components/setup/TopicsSetup";
import { ReviewSetup } from "@/components/setup/ReviewSetup";
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

export default async function Settings({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ added?: string; error?: string; team?: string; show?: string }> }) {
  const { section: raw } = await params;
  if (!(SETTINGS_SECTIONS as readonly string[]).includes(raw)) notFound();
  const section = raw as SettingsSection;
  const on = (s: SettingsSection) => section === s;
  const { added, error, team: teamParam, show: showParam } = await searchParams;
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
  const inExam = (await d.select().from(goldenItem).orderBy(desc(goldenItem.createdAt))).map((r) => ({ itemId: r.fromItemId, g: GoldenItem.parse(r.data), at: r.createdAt }));
  const people = on("people") ? await allViewers(d) : [];
  // The owner previews their own team; the builder picks one.
  const previewTeam = on("preview") ? teams.find((t) => t.key === (viewer.role === "builder" ? teamParam : viewer.team)) ?? teams[0] : undefined;
  const preview = previewTeam ? await previewDigest(d, previewTeam.key) : undefined;
  // An owner's description edit, checked on the golden set before it goes live.
  const editTeamKey = previewTeam?.key ?? (on("teams") ? (viewer.role === "owner" ? viewer.team : undefined) : undefined);
  const edit = editTeamKey ? await editToShow(d, editTeamKey) : null;
  const golden = edit ? await examItems(d) : [];
  const answers = edit ? await goldenAnswers(d) : new Map();
  const editVerdictNow = edit?.result ? verdictFor(edit.result as EvalResult, edit.baseline as EvalResult | null, answers) : null;
  const editCard = edit && (
    <TeamEditCard edit={edit} verdict={editVerdictNow} total={golden.length}
      items={new Map(golden.map((g) => [g.id, { competitor: g.competitor, title: g.title ?? g.url, url: g.url }]))}
      teamNames={Object.fromEntries(teams.map((t) => [t.key, t.name]))}
      canAnswer={(k) => canEditTeam(viewer, k)} actions={{ decide: decideTeamEdit, answer: setTeamAnswer }} />
  );
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

      {on("review") && (
        <ReviewSetup open={review} done={inExam} teams={teams} show={showParam === "done" ? "done" : "open"} canEdit={(k) => canEditTeam(viewer, k)}
          company={(name) => allComps.find((c) => c.name === name)} />
      )}

      {on("competitors") && <CompetitorsSetup d={d} comps={comps} removed={removed} srcs={srcs} canFix={viewer.role === "builder"} />}

      {on("topics") && <TopicsSetup d={d} topics={topics} teams={teams} teamFilter={teams.some((t) => t.key === teamParam) ? teamParam : undefined} />}

      {on("suggestions") && pending.length === 0 && <div className="card muted">No suggestions waiting. We check Noma&apos;s site on every run.</div>}
      {on("suggestions") && pending.map((s) => (
        <form key={s.id} action={approveSuggestion} className="card" style={{ marginBottom: 12 }}>
          <input type="hidden" name="id" value={s.id} />
          <div>{s.whatChanged}</div>
          <div className="muted">Seen on <a href={s.pageUrl}>{s.pageUrl}</a> · {localDate(s.createdAt)}</div>
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
                    <div className="muted">Replaced {localDateTime(h.replacedAt)} by {h.replacedBy === "suggestion" ? "an approved suggestion" : h.replacedBy === "restore" ? "a restore" : "an edit"}</div>
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

      {on("teams") && editCard}
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
            <div className="muted small" style={{ marginTop: 6 }}>A new description is checked on the test posts before it goes live (about 2 minutes). Each team is judged on its own, so it can't change another team's updates.</div>
            <button style={{ marginTop: 8 }}>Save and check</button>
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
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "baseline" }}>
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

      {on("preview") && editCard}
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
                {preview.mode === "last" && <><strong>Nothing new is waiting.</strong> This is the last digest {previewTeam.name} got{preview.lastSentAt ? `, on ${localDate(preview.lastSentAt)}` : ""}.</>}
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
                ? <><TryLens teamKey={previewTeam.key} teamName={previewTeam.name} lens={edit && edit.status !== "saved" && edit.status !== "saved_anyway" ? edit.lens : previewTeam.lens} tryAction={tryLensAction} saveAction={updateTeam} checking={edit?.status === "checking"} total={golden.length || undefined} /></>
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
