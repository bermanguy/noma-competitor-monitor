import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { competitor, item, source } from "@/db/schema";
import { sourceHealth, type Health } from "@/pipeline/health";
import { archiveCompetitorAction, addWatchedPage, setCompetitorActive } from "@/app/settings/actions";
import { AddCompetitorWizard } from "@/components/AddCompetitorWizard";
import { CompanyLogo } from "@/components/CompanyLogo";
import { localDay, localShort } from "@/lib/time";

type Competitor = typeof competitor.$inferSelect;
type Source = typeof source.$inferSelect;

const STATUS: Record<Health | "paused", string> = { healthy: "Healthy", failing: "Needs attention", quiet: "Unusually quiet", new: "Starting", paused: "Paused" };
const RANK: Record<Health, number> = { failing: 0, quiet: 1, new: 2, healthy: 3 };
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
/** "today", "yesterday", "3 days ago", then a date. */
function ago(d: Date, now: Date) {
  const days = Math.round((Date.parse(localDay(now)) - Date.parse(localDay(d))) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 14 ? `${days} days ago` : localShort(d, now);
}
const isCanary = (mine: Source[]) => mine.length > 0 && mine.every((s) => /\/canary(\/|$)/.test(s.url));

/** Setup › Competitors: one card per competitor with its logo, what we watch, how it is doing, and what it has said lately. */
export async function CompetitorsSetup({ d, comps, removed, srcs, canFix }: { d: DB; comps: Competitor[]; removed: Competitor[]; srcs: Source[]; canFix: boolean }) {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 864e5);
  const ids = comps.map((c) => c.id);
  const activity = ids.length
    ? await d.select({ id: item.competitorId, n: sql<number>`count(*) filter (where ${item.firstSeenAt} >= ${since.toISOString()})`.mapWith(Number), last: sql<Date | null>`max(${item.firstSeenAt})`.mapWith((v) => (v ? new Date(v) : null)) })
        .from(item).where(and(inArray(item.competitorId, ids), eq(item.status, "judged"))).groupBy(item.competitorId)
    : [];
  const act = new Map(activity.map((a) => [a.id, a]));
  const cards = comps.map((c) => {
    const mine = srcs.filter((s) => s.competitorId === c.id);
    const health = mine.map((s) => ({ s, h: sourceHealth(s, now).health }));
    const worst = health.map((x) => x.h).sort((a, b) => RANK[a] - RANK[b])[0] ?? "new";
    return { c, mine, health, worst, status: (c.active ? worst : "paused") as Health | "paused", a: act.get(c.id), canary: isCanary(mine) };
  });
  // The test page last; paused after the ones we watch; then by name.
  cards.sort((x, y) => Number(x.canary) - Number(y.canary) || Number(!x.c.active) - Number(!y.c.active) || x.c.name.localeCompare(y.c.name));
  const watching = cards.filter((x) => x.c.active && !x.canary);
  const attention = watching.filter((x) => x.worst === "failing" || x.worst === "quiet").length;
  const recent = watching.reduce((n, x) => n + (x.a?.n ?? 0), 0);

  return (
    <div className="co-page">
      <div className="co-stats">
        <span><strong>{watching.length}</strong> watched</span>
        <span><strong>{watching.reduce((n, x) => n + x.mine.length, 0)}</strong> pages and blogs</span>
        <span><strong>{recent}</strong> changes in the last 30 days</span>
        {attention > 0 ? <span className="warn"><i className="dot" /> {attention} {attention === 1 ? "needs" : "need"} attention</span> : <span className="ok"><i className="dot" /> All sources healthy</span>}
        <span className="co-cta"><AddCompetitorWizard trigger="button" /></span>
      </div>

      <div className="co-grid">
        {cards.map(({ c, mine, health, worst, status, a, canary }) => {
          const posts = health.filter((x) => x.s.kind !== "page");
          const pages = health.filter((x) => x.s.kind === "page");
          const bad = health.filter((x) => x.h === "failing" || x.h === "quiet");
          return (
            <section key={c.id} className={`co-card${c.active ? "" : " paused"}${canary ? " canary" : ""}`}>
              <header className="co-hd">
                <CompanyLogo id={c.id} name={c.name} domain={c.domain} size={40} canary={canary} />
                <div className="co-id">
                  <strong>{canary ? "Canary" : c.name}</strong>
                  <span className="muted">{canary ? "Our test page, proves the path end to end" : <a href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}</a>}</span>
                </div>
                <span className={`co-status s-${status}`}><i className="dot" />{STATUS[status]}</span>
                <details className="co-more">
                  <summary aria-label={`More for ${c.name}`}>•••</summary>
                  <div className="co-menu">
                    <form action={setCompetitorActive}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                      <button className="co-mi">{c.active ? "Pause checking" : "Resume checking"}<span>{c.active ? "Keep it, but skip it in each check" : "Check it again from the next run"}</span></button>
                    </form>
                    <form action={archiveCompetitorAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="archived" value="1" />
                      <button className="co-mi danger">Remove<span>Its history is kept, and you can restore it</span></button>
                    </form>
                  </div>
                </details>
              </header>

              {c.active && bad.length > 0 && (
                <div className="co-warn">
                  {bad.map((x) => x.s.label).join(", ")}: {worst === "failing" ? "we can't read it right now." : "no new posts for a while."}{" "}
                  {canFix ? <a href="/ops/sources">Fix in Builder › Sources</a> : "The Builder was alerted in Slack. Nothing for you to do."}
                </div>
              )}

              <div className="co-watch">
                {posts.length > 0 && (
                  <div className="co-wrow"><span className="co-wl">New posts</span>
                    <span className="co-chips">{posts.map(({ s, h }) => <Chip key={s.id} s={s} h={h} />)}</span>
                  </div>
                )}
                {pages.length > 0 && (
                  <div className="co-wrow"><span className="co-wl">Pages</span>
                    <span className="co-chips">{pages.map(({ s, h }) => <Chip key={s.id} s={s} h={h} />)}</span>
                  </div>
                )}
                {mine.length === 0 && <div className="muted">Nothing found yet. Watch a page below.</div>}
              </div>

              <footer className="co-ft">
                {!c.active ? <span className="co-act">Paused: not checked until you resume it</span>
                  : a?.last ? <a className="co-act" href={`/?company=${c.id}&team=all&date=all`}>{a.n > 0 ? <><strong>{a.n}</strong> {a.n === 1 ? "change" : "changes"} in 30 days</> : "No changes in 30 days"} · last one {ago(a.last, now)} <span className="co-arrow">→</span></a>
                  : <span className="co-act">No changes yet</span>}
                <details className="co-add">
                  <summary>+ Watch a page</summary>
                  <form action={addWatchedPage} className="co-add-form">
                    <input type="hidden" name="competitorId" value={c.id} />
                    <input type="text" name="url" placeholder={`https://${c.domain}/pricing`} required aria-label="Page address" />
                    <input type="text" name="label" placeholder="Name, e.g. Pricing" aria-label="Name" />
                    <select name="pageType" aria-label="Page type">
                      <option value="general">General page</option>
                      <option value="pricing">Pricing page</option>
                    </select>
                    <button>Watch page</button>
                    <div className="muted small">General pages report meaningful wording changes. Pricing pages compare each plan&apos;s price and features, and report exactly what changed.</div>
                  </form>
                </details>
              </footer>
            </section>
          );
        })}
      </div>

      {removed.length > 0 && (
        <div className="co-removed">
          <div className="co-removed-h">Removed <span>· history kept, restore any time</span></div>
          {removed.map((c) => (
            <form key={c.id} action={archiveCompetitorAction} className="co-rrow">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value="0" />
              <CompanyLogo id={c.id} name={c.name} domain={c.domain} size={22} />
              <strong>{c.name}</strong><span className="muted">{host(c.domain)}{c.archivedAt ? ` · removed ${ago(c.archivedAt, now)}` : ""}</span>
              <button className="secondary sm">Restore</button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ s, h }: { s: Source; h: Health }) {
  const pricing = s.pageType === "pricing";
  return (
    <a className={`co-chip${pricing ? " pricing" : ""}${h === "failing" || h === "quiet" ? " bad" : ""}`} href={s.url} target="_blank" rel="noreferrer" title={host(s.url)}>
      {pricing && <span className="co-cur" aria-hidden>$</span>}{s.label}
    </a>
  );
}
