import { and, eq, gte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { item, judgment, team, topic } from "@/db/schema";
import { addTopic, removeTopic, updateTopic } from "@/app/settings/actions";

type Topic = typeof topic.$inferSelect;
type Team = typeof team.$inferSelect;

/** Setup › Topics: a card per topic, the teams it matters to, and how often it came up lately. */
export async function TopicsSetup({ d, topics, teams, teamFilter }: { d: DB; topics: Topic[]; teams: Team[]; teamFilter?: string }) {
  const since = new Date(Date.now() - 30 * 864e5);
  const tagged = await d.select({ itemId: judgment.itemId, topics: judgment.topics }).from(judgment)
    .innerJoin(item, eq(judgment.itemId, item.id))
    .where(and(eq(item.status, "judged"), gte(item.firstSeenAt, since)));
  // Changes tagged with each topic in the last 30 days, counted once per change whichever team tagged it.
  const count = new Map<string, Set<number>>();
  for (const r of tagged) for (const t of r.topics) (count.get(t) ?? count.set(t, new Set()).get(t)!).add(r.itemId);
  const shown = teamFilter ? topics.filter((t) => t.teamKeys.includes(teamFilter)) : topics;
  const name = (k: string) => teams.find((x) => x.key === k)?.name ?? k;

  return (
    <div className="tp-page">
      <div className="tp-bar">
        <div className="seg" style={{ marginLeft: 0 }}>
          <a href="/settings/topics" className={!teamFilter ? "on" : ""}>All teams <span className="n">{topics.length}</span></a>
          {teams.map((t) => <a key={t.key} href={`/settings/topics?team=${t.key}`} className={teamFilter === t.key ? "on" : ""}>{t.name} <span className="n">{topics.filter((x) => x.teamKeys.includes(t.key)).length}</span></a>)}
        </div>
        <span className="muted">The judge tags each change with the topics it fits. Digests are grouped by them.</span>
      </div>

      <div className="tp-grid">
        {shown.map((t) => {
          const n = count.get(t.name)?.size ?? 0;
          return (
            <details key={t.id} className="tp-card">
              <summary>
                <span className="tp-hash" aria-hidden>#</span>
                <div className="tp-body">
                  <div className="tp-name">{t.name}</div>
                  <p className="tp-desc">{t.description}</p>
                  <div className="tp-foot">
                    <span className="tp-teams">{t.teamKeys.map((k) => <span key={k} className={`tm tm-${k}`}>{name(k)}</span>)}</span>
                    <span className="tp-n">{n > 0 ? <>{n} {n === 1 ? "change" : "changes"} · 30 days</> : "No changes in 30 days"}</span>
                  </div>
                </div>
                <span className="tp-edit">Edit</span>
              </summary>
              <form action={updateTopic} className="tp-form">
                <input type="hidden" name="id" value={t.id} />
                <label>Name<input type="text" name="name" defaultValue={t.name} required /></label>
                <label>What counts<textarea name="description" defaultValue={t.description} rows={3} /></label>
                <div className="tp-checks"><span>Matters to</span>
                  {teams.map((x) => <label key={x.key} className="tp-check"><input type="checkbox" name="teams" value={x.key} defaultChecked={t.teamKeys.includes(x.key)} /> {x.name}</label>)}
                </div>
                <div className="tp-acts">
                  <button>Save topic</button>
                  <button className="link-btn" formAction={removeTopic} formNoValidate>Remove topic</button>
                  {n > 0 && <a className="muted" href={`/?topic=${encodeURIComponent(t.name)}&team=all`} style={{ marginLeft: "auto" }}>See its changes →</a>}
                </div>
              </form>
            </details>
          );
        })}

        <details className="tp-card tp-new">
          <summary>
            <span className="tp-hash plus" aria-hidden>+</span>
            <div className="tp-body">
              <div className="tp-name">New topic</div>
              <p className="tp-desc">Something new to look for, such as a technique, a market or a kind of news. Used from the next check onward.</p>
            </div>
          </summary>
          <form action={addTopic} className="tp-form">
            <label>Name<input type="text" name="name" placeholder="e.g. Browser agents" required /></label>
            <label>What counts<textarea name="description" placeholder="In a few words, what counts" rows={2} /></label>
            <div className="tp-checks"><span>Matters to</span>
              {teams.map((x) => <label key={x.key} className="tp-check"><input type="checkbox" name="teams" value={x.key} defaultChecked={x.key === teamFilter} /> {x.name}</label>)}
            </div>
            <div className="tp-acts"><button>Add topic</button></div>
          </form>
        </details>
      </div>
    </div>
  );
}
