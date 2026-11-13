import { desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, delivery, item, judgment, team, type Level } from "@/db/schema";
import { currentViewer } from "@/lib/viewer";
import { CompanyLogo } from "@/components/CompanyLogo";
import { FilterMenu } from "@/components/FilterMenu";

export const dynamic = "force-dynamic";

/**
 * The page says how much a change matters; Slack delivery is shown only inside an opened row.
 * The words follow the level definitions: alert = see it today, digest = worth knowing this week, log = loosely related.
 */
const LEVEL_NAME: Record<Level, string> = { alert: "Urgent", digest: "Worth knowing", log: "FYI", none: "Not relevant" };
const LEVEL_HINT: Record<Level, string> = { alert: "see it today", digest: "this week", log: "loosely related", none: "" };
const RANK: Record<Level, number> = { alert: 0, digest: 1, log: 2, none: 3 };
const DATES: Record<string, { label: string; days: number | null }> = {
  "7": { label: "Last 7 days", days: 7 }, "30": { label: "Last 30 days", days: 30 }, "90": { label: "Last 90 days", days: 90 }, all: { label: "Any time", days: null },
};
const KIND: Record<string, string> = { post: "Blog post", page_change: "Page change" };
const NOT_JUDGED: Record<string, string> = { cosmetic: "Not judged: cosmetic change", held: "Not judged: held back", failed: "Not judged: failed" };

type Params = { team?: string; level?: string; company?: string; date?: string; topic?: string; q?: string; all?: string };

function LevelIcon({ level }: { level: Level }) {
  if (level === "alert") return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M8.6 3.8 5.6 8.7h2.3l-.6 3.5 3.1-5h-2.3z" fill="#fff" /></svg>;
  if (level === "digest") return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>;
  return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" /></svg>;
}
const LevelTag = ({ level }: { level: Level }) => <span className={`lvl lvl-${level}`}><LevelIcon level={level} />{LEVEL_NAME[level]}</span>;

const day = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (d: Date, now: Date) =>
  day(d) === day(now) ? d.toISOString().slice(11, 16) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const when = (d: Date) => `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toISOString().slice(11, 16)} UTC`;

export default async function Changes({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const viewer = await currentViewer();
  const d = db();
  const teams = await d.select().from(team).orderBy(team.id);
  // An owner starts on their own team's view; "all" shows every team side by side.
  const teamKey = sp.team === "all" ? undefined : teams.some((t) => t.key === sp.team) ? sp.team : viewer.team ?? undefined;
  const teamName = teams.find((t) => t.key === teamKey)?.name;
  const dateKey = sp.date && DATES[sp.date] ? sp.date : "30";
  const now = new Date();
  const since = DATES[dateKey]!.days ? new Date(now.getTime() - DATES[dateKey]!.days! * 864e5) : new Date(0);

  const statuses = sp.all ? ["judged", "cosmetic", "held", "failed"] : ["judged"];
  const rows = await d
    .select({ i: item, c: competitor })
    .from(item)
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(inArray(item.status, statuses as never[]))
    .orderBy(desc(item.firstSeenAt))
    .limit(300);
  const ids = rows.map((x) => x.i.id);
  const js = ids.length ? await d.select().from(judgment).where(inArray(judgment.itemId, ids)) : [];
  const byItem = new Map<number, typeof js>();
  for (const j of js) byItem.set(j.itemId, [...(byItem.get(j.itemId) ?? []), j]);
  // What actually went to Slack, per judgment: the opened row says it in one line.
  const sent = new Map<number, { kind: string; at: Date }>();
  for (const dl of await d.select().from(delivery).where(gte(delivery.createdAt, new Date(Math.min(since.getTime(), now.getTime() - 120 * 864e5))))) {
    if (dl.status !== "sent" || (dl.kind !== "alert" && dl.kind !== "digest")) continue;
    for (const id of dl.judgmentIds) if (!sent.has(id) || dl.kind === "alert") sent.set(id, { kind: dl.kind, at: dl.createdAt });
  }

  // Every filter except level, so the level tabs can count what each tab would show.
  const q = sp.q?.trim().toLowerCase();
  const base = rows
    .map((x) => {
      const all = byItem.get(x.i.id) ?? [];
      const mine = teamKey ? all.filter((j) => j.teamKey === teamKey) : all;
      const top = mine.reduce<Level>((l, j) => (RANK[j.level] < RANK[l] ? j.level : l), "none");
      const topics = [...new Set(mine.filter((j) => j.level !== "none").flatMap((j) => j.topics))];
      const summary = x.i.status === "judged" ? x.i.statusDetail : x.i.gateReason ?? x.i.statusDetail;
      return { ...x, all, mine, top, topics, summary };
    })
    .filter((x) => x.i.status !== "judged" || x.top !== "none")
    .filter((x) => x.i.firstSeenAt >= since)
    .filter((x) => !sp.company || String(x.c.id) === sp.company)
    .filter((x) => !sp.topic || x.topics.includes(sp.topic))
    .filter((x) => !q || `${x.i.title ?? ""} ${x.summary ?? ""} ${x.c.name}`.toLowerCase().includes(q));
  const count = (l?: Level) => base.filter((x) => !l || x.top === l).length;
  const level = (["alert", "digest", "log"] as Level[]).find((l) => l === sp.level);
  const visible = base.filter((x) => !level || x.top === level);

  // Options for the menus, from the rows in the current team and date range.
  const inRange = rows.filter((x) => x.i.firstSeenAt >= since);
  const companies = [...new Map(inRange.map((x) => [x.c.id, x.c])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const topicCounts = new Map<string, number>();
  for (const x of base) for (const t of x.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);

  const link = (patch: Partial<Params>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const groupOf = (dt: Date) => (day(dt) === day(now) ? "Today" : now.getTime() - dt.getTime() < 7 * 864e5 ? "This week" : "Earlier");
  const cols = teamKey ? "cols-1" : "cols-3";
  const hasFilters = !!(sp.company || sp.topic || sp.q || level || dateKey !== "30" || sp.all);

  return (
    <div className="changes">
      <div className="ch-head">
        <h1>Competitor changes</h1>
        <div className="seg">
          <a href={link({ team: "all" })} className={!teamKey ? "on" : ""}>All teams</a>
          {teams.map((t) => <a key={t.key} href={link({ team: t.key })} className={teamKey === t.key ? "on" : ""}>{t.name}</a>)}
        </div>
      </div>
      <p className="lead">Every competitor change we found, and how much it matters to {teamName ?? "each team"}.</p>

      <nav className="ltabs" aria-label="Level">
        <a href={link({ level: undefined })} className={!level ? "on" : ""}>All <span className="n">{count()}</span></a>
        {(["alert", "digest", "log"] as Level[]).map((l) => (
          <a key={l} href={link({ level: l })} className={level === l ? "on" : ""}><span className={`lvl-${l}`}><LevelIcon level={l} /></span>{LEVEL_NAME[l]} <span className="n">{count(l)}</span></a>
        ))}
      </nav>

      <div className="fbar">
        <form className="fsearch" action="/">
          {Object.entries(sp).filter(([k, v]) => k !== "q" && v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="search" name="q" defaultValue={sp.q} placeholder="Search title or summary" aria-label="Search" />
        </form>
        <FilterMenu label="Company" clearParam="company" value={companies.find((c) => String(c.id) === sp.company)?.name}
          groups={[{ param: "company", options: companies.map((c) => ({ value: String(c.id), label: c.name, domain: c.domain, canary: inRange.some((x) => x.c.id === c.id && x.i.isCanary), count: inRange.filter((x) => x.c.id === c.id).length })) }]} />
        <FilterMenu label="Date" value={DATES[dateKey]!.label} groups={[{ param: "date", options: Object.entries(DATES).map(([k, v]) => ({ value: k, label: v.label })) }]} />
        <FilterMenu label={sp.topic ? "Topic" : "Filter"} dashed={!sp.topic} clearParam="topic" value={sp.topic}
          groups={[
            { param: "topic", title: "Topic", options: [...topicCounts].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ value: t, label: t, count: n })) },
            { param: "all", title: "Also show", options: [{ value: "1", label: "Changes not judged (cosmetic, held, failed)" }] },
          ]} />
        {hasFilters && <a className="fclear" href={teamKey ? `/?team=${teamKey}` : "/?team=all"}>Clear</a>}
      </div>

      <div className={`ch-table ${cols}`}>
        <div className="ch-th">
          <span /><span>Change</span>
          {teamKey ? <><span>Topic</span><span>Level</span></> : teams.map((t) => <span key={t.key}>{t.name}</span>)}
          <span className="r">Found</span><span />
        </div>
        {visible.length === 0 && <div className="ch-empty">{rows.length === 0 ? "Nothing yet. New posts and page changes appear here after the next scheduled check." : "No changes match these filters."}</div>}
        {visible.map((x, n) => {
          const g = groupOf(x.i.firstSeenAt);
          const first = n === 0 || groupOf(visible[n - 1]!.i.firstSeenAt) !== g;
          const levelOf = (k: string) => x.all.find((j) => j.teamKey === k)?.level ?? "none";
          return (
            <div key={x.i.id}>
              {first && <div className="ch-grp">{g}<span>{visible.filter((y) => groupOf(y.i.firstSeenAt) === g).length}</span></div>}
              <details className="ch-row">
                <summary>
                  <CompanyLogo name={x.c.name} domain={x.c.domain} canary={x.i.isCanary} />
                  <div className="ch-main">
                    <div className="ch-l1">
                      <span className="ch-co">{x.c.name}</span><span className="ch-kind">· {KIND[x.i.kind] ?? x.i.kind}</span>
                      {x.i.isCanary && <span className="tag tag-test">Test page</span>}
                      {x.i.isBackfill && <span className="tag">Before monitoring</span>}
                      {x.i.status !== "judged" && <span className="tag">{NOT_JUDGED[x.i.status] ?? x.i.status}</span>}
                    </div>
                    <div className="ch-title">{x.i.title ?? x.i.url}</div>
                    {x.summary && <div className="ch-one">{x.summary}</div>}
                  </div>
                  {teamKey
                    ? <><span className="ch-topic">{x.topics[0] ?? ""}</span><span>{x.top !== "none" && <LevelTag level={x.top} />}</span></>
                    : teams.map((t) => <span key={t.key}>{levelOf(t.key) !== "none" && <LevelTag level={levelOf(t.key)} />}</span>)}
                  <span className="ch-date">{shortDate(x.i.firstSeenAt, now)}</span>
                  <span className="ch-chev" aria-hidden>›</span>
                </summary>
                <div className="ch-exp">
                  {x.summary && <p className="ch-sum">{x.summary}</p>}
                  {x.all.length > 0 && (
                    <div className="reads">
                      {teams.map((t) => {
                        const j = x.all.find((y) => y.teamKey === t.key);
                        if (!j) return null;
                        const s = sent.get(j.id);
                        const slack = s ? (s.kind === "alert" ? `Sent to Slack as an alert, ${when(s.at)}` : `In the ${s.at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} digest`)
                          : j.level === "none" || j.level === "log" ? "Not sent to Slack"
                          : !j.evidenceOk ? "Not sent: a quote was not found in the source"
                          : t.noise === "quiet" && j.level === "digest" ? `Not sent: ${t.name} gets urgent changes only`
                          : x.i.isBackfill && j.level === "alert" ? "Not sent as an alert: published before monitoring started"
                          : "Not sent yet";
                        return (
                          <div key={t.key} className={`read${t.key === teamKey ? " me" : ""}`}>
                            <div className="read-h"><strong>{t.name}</strong>{j.level !== "none" ? <LevelTag level={j.level} /> : <span className="muted">Not relevant</span>}</div>
                            <p className={j.level === "none" || j.level === "log" ? "dim" : ""}>{j.why}</p>
                            {j.level !== "none" && j.evidence.slice(0, 2).map((qt, k) => <blockquote key={k}>“{qt}”</blockquote>)}
                            {j.topics.length > 0 && <div className="read-topics">{j.topics.join(" · ")}</div>}
                            <div className="read-slack">{slack}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {x.i.kind === "page_change" && x.i.diff && <details className="ch-diff"><summary>What changed</summary><pre className="diff">{x.i.diff}</pre></details>}
                  <div className="ch-acts">
                    <a href={x.i.url} target="_blank" rel="noreferrer">Open the {x.i.kind === "post" ? "post" : "page"} ↗</a>
                    <span className="muted">
                      {x.i.publishedAt ? `Published ${x.i.publishedAt.toISOString().slice(0, 10)} · ` : ""}Found {when(x.i.firstSeenAt)}
                    </span>
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <div className="legend">
        {(["alert", "digest", "log"] as Level[]).map((l) => <span key={l} className={`lvl lvl-${l}`}><LevelIcon level={l} />{LEVEL_NAME[l]}: {LEVEL_HINT[l]}</span>)}
      </div>
    </div>
  );
}
