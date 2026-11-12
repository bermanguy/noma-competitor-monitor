import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ownerSuggestion, team } from "@/db/schema";
import { getOwnerTexts } from "@/lib/owner-text";
import { latestSent, ownerTasks, teamSummaries, type Task, type TeamSummary } from "@/lib/owner-inbox";
import { SuggestionCard } from "./_ui/suggestion";
import { Flash, LevelChip, ago } from "./_ui/parts";

export const dynamic = "force-dynamic";

/**
 * The owner's home: what is waiting for a decision, how each team is doing, and the latest that mattered.
 * Everything links to the one page where the owner acts on it.
 */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ added?: string; error?: string }> }) {
  const { added, error } = await searchParams;
  const d = db();
  const summaries = await teamSummaries(d, 7);
  const { todo, fyi } = await ownerTasks(d, summaries);
  const suggestions = await d.select().from(ownerSuggestion).where(eq(ownerSuggestion.status, "pending")).orderBy(desc(ownerSuggestion.id));
  const teams = await d.select().from(team).orderBy(team.id);
  const company = (await getOwnerTexts(d)).company;
  const latest = await latestSent(d, 5);
  const sentThisWeek = summaries.reduce((n, t) => n + t.counts.alert + t.counts.digest, 0);

  return (
    <>
      <h1>Inbox</h1>
      <p className="lead">
        {todo.length === 0 ? "Nothing needs you right now." : `${todo.length === 1 ? "One thing needs" : `${todo.length} things need`} your decision.`}{" "}
        This week the teams received {sentThisWeek} {sentThisWeek === 1 ? "update" : "updates"} from competitors.
      </p>
      <Flash added={added} error={error} />

      <h2>Waiting for you {todo.length > 0 && <span className="count">{todo.length}</span>}</h2>
      {todo.length === 0 && (
        <div className="card flat empty"><div className="big">✓</div>You&apos;re all caught up. We&apos;ll put new decisions here, and tell you in Slack.</div>
      )}
      {todo.map((t, n) =>
        t.kind === "suggestion"
          ? (() => { const s = suggestions.find((x) => x.id === t.id); return s ? <SuggestionCard key={n} s={s} teams={teams} currentCompany={company} back="/" /> : null; })()
          : <TaskCard key={n} t={t} />,
      )}

      <h2>Your teams this week</h2>
      <div className="tiles">{summaries.map((t) => <TeamTile key={t.key} t={t} />)}</div>

      {fyi.length > 0 && (
        <>
          <h2>Good to know <span className="count">{fyi.length}</span></h2>
          {fyi.map((t, n) => <TaskCard key={n} t={t} />)}
        </>
      )}

      <h2>Latest that reached a team</h2>
      {latest.length === 0 && <div className="card flat muted">Nothing sent yet. New competitor posts and page changes that matter will appear here after the next check.</div>}
      {latest.map(({ i, c, teams: js }) => (
        <div className="card flat" key={i.id}>
          <div className="spread">
            <div>
              <div className="faint">{c.name} · {i.kind === "page_change" ? "page change" : "new post"} · found {ago(i.firstSeenAt)}</div>
              <a href={i.url} target="_blank" rel="noreferrer"><strong>{i.title ?? i.url}</strong></a>
            </div>
            <div className="row">
              {js.map((j) => (
                <span key={j.id} className="row" style={{ gap: 4 }}>
                  <span className="muted">{teams.find((x) => x.key === j.teamKey)?.name ?? j.teamKey}</span><LevelChip level={j.level} />
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
      {latest.length > 0 && <p><a href="/feed">See everything we found, including what we didn&apos;t send and why →</a></p>}
    </>
  );
}

function TaskCard({ t }: { t: Task }) {
  switch (t.kind) {
    case "unhappy-team":
      return (
        <div className="card task warn">
          <div className="icon">👎</div>
          <div className="stack">
            <div className="what">{t.teamName} said {t.count === 1 ? "an item wasn't" : `${t.count} items weren't`} useful</div>
            <div className="muted">{t.reasons.map((r) => `“${r}”`).join(" · ")}</div>
            <div className="faint">Sharpen what {t.teamName} cares about, and preview the effect on recent items before you save.</div>
          </div>
          <div className="act"><a className="button primary" href={`/teams/${t.teamKey}`}>Tune {t.teamName}</a></div>
        </div>
      );
    case "nothing-to-watch":
      return (
        <div className="card task bad">
          <div className="icon">?</div>
          <div className="stack">
            <div className="what">We found nothing to watch for {t.competitor}</div>
            <div className="muted">No blog, news feed or homepage could be read. Add a page you want watched, such as their product or pricing page.</div>
          </div>
          <div className="act"><a className="button primary" href="/competitors">Add a page</a></div>
        </div>
      );
    case "source-problem":
      return (
        <div className="card flat task warn">
          <div className="icon">⚠</div>
          <div className="stack">
            <div className="what">{t.competitor} · {t.label}: {t.reason.startsWith("no new posts") ? t.reason : "we couldn't read it on the last checks"}</div>
            <div className="faint">The operator has been alerted. Nothing for you to do.</div>
          </div>
        </div>
      );
    case "first-check":
      return (
        <div className="card flat task ok">
          <div className="icon">⏱</div>
          <div className="stack">
            <div className="what">{t.competitor} is waiting for its first check</div>
            <div className="faint">{t.sources} {t.sources === 1 ? "source" : "sources"} found. The first check runs within 3 hours: it records what is already published and judges the latest posts.</div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function TeamTile({ t }: { t: TeamSummary }) {
  const rate = t.rated ? Math.round((t.useful / t.rated) * 100) : null;
  return (
    <div className="card tile">
      <div className="spread">
        <h3>{t.name}</h3>
        <span className="chip">{t.noise === "quiet" ? "Urgent only" : "Urgent + daily digest"}</span>
      </div>
      <div className="stats">
        <div className="stat alert"><b>{t.counts.alert}</b><span>sent now</span></div>
        <div className="stat digest"><b>{t.noise === "quiet" ? "–" : t.counts.digest}</b><span>in digest</span></div>
        <div className="stat"><b>{t.counts.log}</b><span>recorded only</span></div>
      </div>
      <div>
        <div className="spread muted"><span>Rated useful (30 days)</span><span>{rate === null ? "no ratings yet" : `${t.useful} of ${t.rated}`}</span></div>
        <div className="meter"><i style={{ width: `${rate ?? 0}%` }} /></div>
      </div>
      {t.lastSent
        ? <div className="muted">Latest: <a href={t.lastSent.url} target="_blank" rel="noreferrer">{t.lastSent.title ?? t.lastSent.url}</a> · {t.lastSent.competitor} · {ago(t.lastSent.at)}</div>
        : <div className="muted">Nothing sent this week.</div>}
      {!t.slackConnected && <div className="faint" style={{ color: "var(--warn)" }}>No Slack channel connected yet. Ask the operator.</div>}
      <div><a className="button" href={`/teams/${t.key}`}>Open {t.name}</a></div>
    </div>
  );
}
