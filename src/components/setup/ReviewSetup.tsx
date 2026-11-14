import type { Level, team } from "@/db/schema";
import type { ReviewItem } from "@/eval/owner-golden";
import type { GoldenItem } from "@/eval/golden";
import { addToExamAction } from "@/app/settings/actions";
import { CompanyLogo } from "@/components/CompanyLogo";
import { LEVEL_NAME, LevelPicker, LevelTag } from "./LevelTag";
import { localShort } from "@/lib/time";

type Team = typeof team.$inferSelect;
type Done = { itemId: number; g: GoldenItem; at: Date };
type Company = { id?: number; name: string; domain: string };

/**
 * Setup › To review: the open votes on top, and what was already answered on its own tab, so a handled
 * item never sits between open ones.
 */
export function ReviewSetup({ open, done, teams, show, company, canEdit }: { open: ReviewItem[]; done: Done[]; teams: Team[]; show: "open" | "done"; company: (name: string) => Company | undefined; canEdit: (teamKey: string) => boolean }) {
  const now = new Date();
  const teamName = (k: string) => teams.find((t) => t.key === k)?.name ?? k;
  const Logo = ({ name, test }: { name: string; test?: boolean }) => {
    const c = company(name);
    return <CompanyLogo id={c?.id} name={name} domain={c?.domain ?? ""} size={32} canary={test} />;
  };
  return (
    <div className="rv-page">
      <div className="ltabs">
        <a href="/settings/review" className={show === "open" ? "on" : ""}>Open <span className="n">{open.length}</span></a>
        <a href="/settings/review?show=done" className={show === "done" ? "on" : ""}>Done <span className="n">{done.length}</span></a>
      </div>

      {show === "open" && open.length === 0 && (
        <div className="rv-empty">
          <span className="rv-empty-i" aria-hidden>✓</span>
          <div><strong>You&apos;re all caught up.</strong><div className="muted">When a team marks an update not useful in Slack, it shows up here.{done.length > 0 && <> Answers you already gave are under <a href="/settings/review?show=done">Done</a>.</>}</div></div>
        </div>
      )}
      {show === "open" && open.length > 0 && (
        <p className="muted rv-hint">&quot;Add to the golden set&quot; saves your answer as a test case, so every later eval run checks the judge against it.</p>
      )}
      {show === "open" && open.map((r) => {
        const voted = new Set(r.votes.map((v) => v.team));
        const last = r.votes.reduce((m, v) => (v.at > m ? v.at : m), r.votes[0]!.at);
        return (
          <form key={r.itemId} action={addToExamAction} className="rv-card">
            <input type="hidden" name="itemId" value={r.itemId} />
            {r.goldenId && <input type="hidden" name="goldenId" value={r.goldenId} />}
            <header className="rv-hd">
              <Logo name={r.competitor} test={r.isTest} />
              <div className="rv-id">
                <div className="rv-co">{r.competitor}{r.isTest && <span className="rv-test">test page</span>}</div>
                <a className="rv-title" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
              </div>
              <span className="rv-when">{localShort(last, now)}</span>
            </header>

            <div className="rv-votes">
              {r.votes.map((v, n) => (
                <div key={n} className="rv-vote">
                  <div className="rv-vote-h"><span className="rv-down" aria-hidden>👎</span><strong>{teamName(v.team)}</strong><span className="muted">got</span><LevelTag level={v.level as Level} /></div>
                  <div className="rv-reason">{v.reason ? <>&ldquo;{v.reason}&rdquo;</> : <span className="muted">No reason given</span>}</div>
                  <div className="rv-why"><span>Judge&apos;s reason</span> {v.why}</div>
                </div>
              ))}
            </div>

            <div className="rv-answer">
              <div className="rv-answer-h">{r.goldenId ? "This post is already in the golden set. What should your team have got?" : "What should each team have got?"}</div>
              {teams.filter((t) => !r.goldenId || canEdit(t.key)).map((t) => (
                <div key={t.key} className={`rv-team${voted.has(t.key) ? " voted" : ""}`}>
                  <span className="rv-tn">{t.name}{voted.has(t.key) && <span className="rv-tag">voted</span>}</span>
                  <LevelPicker teamKey={t.key} value={(r.levels[t.key] ?? "none") as Level} />
                </div>
              ))}
              <div className="rv-submit">
                {r.goldenId
                  ? <span className="muted" style={{ flex: 1, alignSelf: "center" }}>Your answer replaces the one in the golden set, so every later eval run checks the judge against it.</span>
                  : <input type="text" name="note" placeholder="Why these levels (optional, kept with the test case)" aria-label="Why these levels" />}
                <button>{r.goldenId ? "Save the answer" : "Add to the golden set"}</button>
              </div>
            </div>
          </form>
        );
      })}

      {show === "done" && done.length === 0 && <div className="rv-empty"><div className="muted">Nothing answered yet. Items you add to the golden set from To review appear here, and you can change an answer later.</div></div>}
      {show === "done" && done.length > 0 && (
        <div className="rv-done">
          {done.map(({ itemId, g, at }) => {
            const expected = (g.expected ?? {}) as Record<string, Level>;
            return (
              <details key={itemId} className="rv-drow">
                <summary>
                  <Logo name={g.competitor} />
                  <div className="rv-id">
                    <div className="rv-co">{g.competitor}</div>
                    <div className="rv-title">{g.title ?? g.url}</div>
                  </div>
                  <span className="rv-answers">
                    {teams.filter((t) => expected[t.key]).map((t) => (
                      <span key={t.key} className="rv-ans" title={`${t.name}: ${LEVEL_NAME[expected[t.key]!]}`}><span className="rv-ans-t">{t.name}</span><LevelTag level={expected[t.key]!} /></span>
                    ))}
                  </span>
                  <span className="rv-when"><span className="rv-ok" aria-hidden>✓</span> {localShort(at, now)}</span>
                  <span className="ch-chev" aria-hidden>›</span>
                </summary>
                <form action={addToExamAction} className="rv-answer">
                  <input type="hidden" name="itemId" value={itemId} />
                  <div className="rv-answer-h">Change the answer <a className="muted" href={g.url} target="_blank" rel="noreferrer">Open the post ↗</a></div>
                  {teams.map((t) => (
                    <div key={t.key} className="rv-team">
                      <span className="rv-tn">{t.name}</span>
                      <LevelPicker teamKey={t.key} value={expected[t.key] ?? "none"} />
                    </div>
                  ))}
                  <div className="rv-submit">
                    <input type="text" name="note" defaultValue={g.note} placeholder="Why these levels" aria-label="Why these levels" />
                    <button className="secondary">Update the answer</button>
                  </div>
                </form>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
