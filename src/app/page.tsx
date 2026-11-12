import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, item, judgment, team } from "@/db/schema";

export const dynamic = "force-dynamic";

const LEVEL_TEXT: Record<string, string> = {
  alert: "Sent now",
  digest: "In daily digest",
  log: "Recorded, not sent",
  none: "Not relevant",
};

export default async function Feed({ searchParams }: { searchParams: Promise<{ team?: string; all?: string }> }) {
  const { team: teamKey, all } = await searchParams;
  const d = db();
  const teams = await d.select().from(team).orderBy(team.id);
  const statuses = all ? ["judged", "cosmetic", "held", "failed"] : ["judged"];
  const items = await d
    .select({ i: item, c: competitor })
    .from(item)
    .innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(inArray(item.status, statuses as never[]))
    .orderBy(desc(item.firstSeenAt))
    .limit(80);
  const ids = items.map((x) => x.i.id);
  const js = ids.length ? await d.select().from(judgment).where(inArray(judgment.itemId, ids)) : [];
  const byItem = new Map<number, typeof js>();
  for (const j of js) byItem.set(j.itemId, [...(byItem.get(j.itemId) ?? []), j]);

  const order = { alert: 0, digest: 1, log: 2, none: 3 } as const;
  const visible = items
    .map((x) => ({ ...x, js: (byItem.get(x.i.id) ?? []).filter((j) => !teamKey || j.teamKey === teamKey) }))
    .filter((x) => !teamKey || x.js.some((j) => j.level !== "none"))
    .sort((a, b) =>
      teamKey ? order[a.js[0]?.level ?? "none"] - order[b.js[0]?.level ?? "none"] || +b.i.firstSeenAt - +a.i.firstSeenAt : 0,
    );

  return (
    <>
      <h1>What we found</h1>
      <p className="lead">
        Every new competitor post and page change, with what it means for each team. Teams get the important ones in Slack;
        everything is listed here so you can check what was and wasn&apos;t sent, and why.
      </p>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <a href="/" className={!teamKey ? "on" : ""}>All teams</a>
        {teams.map((t) => (
          <a key={t.key} href={`/?team=${t.key}`} className={teamKey === t.key ? "on" : ""}>{t.name}</a>
        ))}
        <a href={all ? (teamKey ? `/?team=${teamKey}` : "/") : `/?all=1${teamKey ? `&team=${teamKey}` : ""}`} style={{ float: "right" }}>
          {all ? "Hide filtered-out changes" : "Show filtered-out changes too"}
        </a>
      </div>
      {visible.length === 0 && <div className="card muted">Nothing yet. New posts and page changes appear here after the next scheduled check.</div>}
      {visible.map(({ i, c, js }) => (
        <div className="card" key={i.id}>
          <div className="row">
            <strong>{c.name}</strong>
            <span className="muted">{i.kind === "page_change" ? "Page change" : "New post"}</span>
            <span className="muted">
              {i.publishedAt ? `published ${i.publishedAt.toISOString().slice(0, 10)}` : "publication date not stated"} · found{" "}
              {i.firstSeenAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </span>
            {i.isCanary && <span className="chip lv-log">test page</span>}
            {i.isBackfill && <span className="chip lv-log">before monitoring started</span>}
          </div>
          <div style={{ marginTop: 4 }}>
            <a href={i.url} target="_blank" rel="noreferrer"><strong>{i.title ?? i.url}</strong></a>
          </div>
          {i.statusDetail && i.status === "judged" && <div className="muted">{i.statusDetail}</div>}
          {i.status === "cosmetic" && <div className="muted">Not sent: judged a cosmetic change. {i.gateReason}</div>}
          {(i.status === "held" || i.status === "failed") && <div className="muted">Not sent: {i.statusDetail}</div>}
          {i.kind === "page_change" && i.diff && (
            <details><summary className="muted">What changed</summary><pre className="diff">{i.diff}</pre></details>
          )}
          {js
            .sort((a, b) => order[a.level] - order[b.level])
            .map((j) => (
              <div className="team" key={j.id}>
                <div className="row">
                  <strong>{teams.find((t) => t.key === j.teamKey)?.name ?? j.teamKey}</strong>
                  <span className={`chip lv-${j.level}`}>{LEVEL_TEXT[j.level]}</span>
                  {!j.evidenceOk && <span className="chip lv-alert">held back: quote not found in source</span>}
                  {j.topics.map((t) => <span key={t} className="chip lv-log">{t}</span>)}
                </div>
                <div>{j.why}</div>
                {j.level !== "none" && j.evidence.map((q, k) => <blockquote key={k}>“{q}”</blockquote>)}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}

