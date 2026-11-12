import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { competitor, feedback, item, judgment, run, setting, source, usage } from "@/db/schema";
import { config } from "@/config";
import { sourceHealth } from "@/pipeline/health";
import { addSource, retryItem, runNow, saveCanary, updateSource } from "./actions";

export const dynamic = "force-dynamic";

export default async function Ops({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const d = db();
  const runs = await d.select().from(run).orderBy(desc(run.id)).limit(12);
  const srcs = await d.select({ s: source, c: competitor }).from(source).innerJoin(competitor, eq(source.competitorId, competitor.id)).orderBy(competitor.name, source.id);
  const comps = await d.select().from(competitor).orderBy(competitor.name);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const spend = await d
    .select({ purpose: usage.purpose, model: usage.model, calls: sql<number>`count(*)`, cost: sql<number>`sum(${usage.costUsd})` })
    .from(usage).where(gte(usage.createdAt, monthStart)).groupBy(usage.purpose, usage.model);
  const total = spend.reduce((n, r) => n + Number(r.cost), 0);
  const stuck = await d.select({ i: item, c: competitor }).from(item).innerJoin(competitor, eq(item.competitorId, competitor.id))
    .where(inArray(item.status, ["held", "failed"])).orderBy(desc(item.id)).limit(20);
  const heldEvidence = await d.select({ n: sql<number>`count(*)` }).from(judgment).where(eq(judgment.evidenceOk, false));
  const fb = await d
    .select({ team: judgment.teamKey, useful: sql<number>`sum(case when ${feedback.useful} then 1 else 0 end)`, total: sql<number>`count(*)` })
    .from(feedback).innerJoin(judgment, eq(feedback.judgmentId, judgment.id)).groupBy(judgment.teamKey);
  const [canary] = await d.select().from(setting).where(eq(setting.key, "canary"));

  return (
    <>
      <h1>Operator</h1>
      <p className="lead">Health of every source, every run, model spend and output quality. Business users never see this page.</p>
      {msg && <div className="notice">{msg}</div>}

      <div className="row" style={{ marginBottom: 8 }}>
        <form action={runNow}><button>Run now</button></form>
        <span className="muted">Scheduled every 3 hours. Judge model: {config.judgeModel}. Gate model: {config.gateModel}.</span>
      </div>

      <h2>Runs</h2>
      <table>
        <thead><tr><th>#</th><th>Started (UTC)</th><th>Trigger</th><th>Status</th><th>Sources</th><th>New</th><th>Judged</th><th>Sent</th><th>Error</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td>{r.trigger}</td>
              <td className={r.status === "ok" ? "h-healthy" : r.status === "running" ? "h-new" : r.status === "partial" ? "h-quiet" : "h-failing"}>{r.status}</td>
              <td>{r.stats.sources ?? "-"}{r.stats.sourcesFailed ? ` (${r.stats.sourcesFailed} failed)` : ""}</td>
              <td>{r.stats.newItems ?? "-"}</td>
              <td>{r.stats.judged ?? "-"}</td>
              <td>{(r.stats.alerts ?? 0) + (r.stats.digests ?? 0)}</td>
              <td className="muted">{r.error?.split("\n")[0]?.slice(0, 120)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Sources</h2>
      <table>
        <thead><tr><th>Source</th><th>Health</th><th>Last success</th><th>Settings</th></tr></thead>
        <tbody>
          {srcs.map(({ s, c }) => {
            const h = sourceHealth(s);
            return (
              <tr key={s.id}>
                <td><strong>{c.name}</strong> · {s.label} <span className="muted">({s.kind})</span><div className="muted">{s.url}</div></td>
                <td><span className={`chip h-${h.health}`}>{h.health}</span><div className="muted">{h.reason}</div></td>
                <td className="muted">{s.lastSuccessAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never"}</td>
                <td>
                  <form action={updateSource} style={{ display: "grid", gap: 4 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="text" name="url" defaultValue={s.url} />
                    {s.kind === "listing" && <input type="text" name="linkPrefix" defaultValue={s.linkPrefix ?? ""} placeholder="link prefix, e.g. /blog" />}
                    <div className="row">
                      <select name="fetchMode" defaultValue={s.fetchMode} style={{ width: "auto" }}>
                        <option value="http">Plain HTTP</option><option value="browser">Headless browser</option>
                      </select>
                      <select name="active" defaultValue={s.active ? "1" : "0"} style={{ width: "auto" }}>
                        <option value="1">Active</option><option value="0">Off</option>
                      </select>
                      <button className="secondary">Save</button>
                    </div>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card" style={{ marginTop: 12 }}>
        <form action={addSource} className="row">
          <select name="competitorId" style={{ width: "auto" }}>{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="kind" style={{ width: "auto" }}><option value="listing">Blog listing</option><option value="feed">RSS/Atom feed</option><option value="page">Watched page</option></select>
          <div style={{ flex: 2 }}><input type="text" name="url" placeholder="https://..." /></div>
          <div style={{ flex: 1 }}><input type="text" name="label" placeholder="Label" /></div>
          <div style={{ flex: 1 }}><input type="text" name="linkPrefix" placeholder="/blog (listings)" /></div>
          <button>Add source</button>
        </form>
      </div>

      <div className="grid2">
        <div>
          <h2>Model spend this month</h2>
          <table>
            <thead><tr><th>Purpose</th><th>Model</th><th>Calls</th><th>Cost</th></tr></thead>
            <tbody>
              {spend.map((r) => <tr key={r.purpose + r.model}><td>{r.purpose}</td><td>{r.model}</td><td>{r.calls}</td><td>${Number(r.cost).toFixed(2)}</td></tr>)}
              <tr><td colSpan={3}><strong>Total</strong> (cap ${config.budgetPerMonthUsd})</td><td><strong>${total.toFixed(2)}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Output quality</h2>
          <table>
            <thead><tr><th>Team</th><th>Rated</th><th>Useful</th></tr></thead>
            <tbody>
              {fb.length === 0 && <tr><td colSpan={3} className="muted">No ratings yet.</td></tr>}
              {fb.map((r) => <tr key={r.team}><td>{r.team}</td><td>{r.total}</td><td>{Math.round((100 * Number(r.useful)) / Number(r.total))}%</td></tr>)}
            </tbody>
          </table>
          <p className="muted">Judgments held back because a quote was not in the source: {heldEvidence[0]?.n ?? 0}. Golden-set precision per team: see the latest eval report in the repository.</p>
        </div>
      </div>

      <h2>Items not sent because of an error</h2>
      {stuck.length === 0 ? <div className="card muted">None.</div> : (
        <table>
          <tbody>
            {stuck.map(({ i, c }) => (
              <tr key={i.id}><td>{c.name}</td><td><a href={i.url}>{i.title ?? i.url}</a></td><td className="muted">{i.status}: {i.statusDetail}</td>
                <td><form action={retryItem}><input type="hidden" name="id" value={i.id} /><button className="secondary">Retry</button></form></td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Canary page</h2>
      <p className="muted">A page we control, watched like a competitor page. Edit it to check the whole chain end to end: the next run should detect, judge and deliver the change, labelled as a test.</p>
      <form action={saveCanary} className="card">
        <textarea name="text" defaultValue={canary?.value ?? ""} style={{ minHeight: 140 }} />
        <button style={{ marginTop: 8 }}>Update canary page</button> <a href="/canary" target="_blank">View</a>
      </form>
    </>
  );
}
