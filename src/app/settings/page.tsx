import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, source, team, topic } from "@/db/schema";
import { sourceHealth } from "@/pipeline/health";
import { addCompetitor, addTopic, addWatchedPage, removeTopic, setCompetitorActive, updateTeam } from "./actions";

export const dynamic = "force-dynamic";

const HEALTH_TEXT = { healthy: "Healthy", failing: "Needs attention", quiet: "Unusually quiet", new: "Starting" } as const;

export default async function Settings({ searchParams }: { searchParams: Promise<{ added?: string; error?: string }> }) {
  const { added, error } = await searchParams;
  const d = db();
  const comps = await d.select().from(competitor).orderBy(competitor.name);
  const srcs = await d.select().from(source).where(eq(source.active, true));
  const teams = await d.select().from(team).orderBy(team.id);
  const topics = await d.select().from(topic).where(eq(topic.active, true)).orderBy(topic.id);

  return (
    <>
      <h1>Competitors and topics</h1>
      <p className="lead">Decide who we watch, what we look for, and what each team cares about. Changes apply from the next check.</p>
      {added && <div className="notice">{added}</div>}
      {error && <div className="notice" style={{ borderColor: "#f3c1c1", background: "#fff3f3" }}>{error}</div>}

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
              <td><strong>{t.name}</strong><div className="muted">{t.description}</div></td>
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

      <h2>What each team cares about</h2>
      <p className="muted">This is the instruction the system follows when it decides what matters to each team. Write it the way you would brief a new analyst.</p>
      <div className="grid2">
        {teams.map((t) => (
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
        ))}
      </div>
    </>
  );
}

function rank(h: string) {
  return ({ failing: 0, quiet: 1, new: 2, healthy: 3 } as Record<string, number>)[h] ?? 4;
}
