import { desc, eq, gte, inArray, sql } from "drizzle-orm";
import { localDateTime, localTime } from "@/lib/time";
import { db } from "@/db/client";
import { competitor, delivery, feedback, item, judgment, run, setting, source, usage } from "@/db/schema";
import { config } from "@/config";
import { DEFAULT_CANARY_PRICING } from "@/lib/canary";
import { sourceHealth } from "@/pipeline/health";
import { addSource, retryItem, runExam, runNow, saveCanary, saveCanaryPricing, saveExamBaseline, updateSource } from "../actions";
import { examState } from "@/eval/run";
import { compareRuns, ownerItemResults, pct } from "@/eval/score";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ownerGolden } from "@/eval/owner-golden";
import { notFound, redirect } from "next/navigation";
import { computeMetrics } from "@/lib/monitoring";
import { MonitoringOverview } from "@/components/MonitoringOverview";
import { OPS_SECTIONS, subLabel, type OpsSection } from "@/lib/nav";

const LEAD: Record<OpsSection, string> = {
  overview: "The health of the system in eight numbers, each with its target, and the alert rules that watch them.",
  runs: "Every run of the pipeline, newest first.",
  sources: "Every page and feed we read, and whether it is healthy.",
  errors: "Items that failed or were held back, so nothing is lost silently.",
  evals: "Test the judge on the golden set before a prompt or model change ships, and compare with the last good run.",
  feedback: "After a change ships: how useful each team finds what we send, from their 👍/👎 in Slack. \"Not useful\" votes go to Setup → To review, where the owner can add them to the golden set.",
  spend: "What the models cost this month.",
  canary: "Pages we control, watched like competitor pages, to test the whole chain end to end.",
};

export const dynamic = "force-dynamic";

export default async function Ops({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { section: raw } = await params;
  const moved: Record<string, string> = { exam: "evals", quality: "feedback" };
  if (moved[raw]) redirect(`/ops/${moved[raw]}`);
  if (!(OPS_SECTIONS as readonly string[]).includes(raw)) notFound();
  const section = raw as OpsSection;
  const on = (s: OpsSection) => section === s;
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
  const exam = await examState(d);
  const ownerItems = await ownerGolden(d);
  const ownerResults = ownerItemResults(exam.last?.outcomes ?? [], ownerItems.map((g) => g.id));
  const [canary] = await d.select().from(setting).where(eq(setting.key, "canary"));
  const [canaryPricing] = await d.select().from(setting).where(eq(setting.key, "canary-pricing"));

  return (
    <>
      <h1>{subLabel("builder", section)}</h1>
      <p className="lead">{LEAD[section]}</p>
      {msg && <div className="notice">{msg}</div>}

      {on("overview") && (
        <MonitoringOverview
          metrics={await computeMetrics(d)}
          recentAlerts={(await d.select({ at: delivery.createdAt, key: delivery.key }).from(delivery).where(eq(delivery.kind, "ops")).orderBy(desc(delivery.id)).limit(5))}
        />
      )}

      {on("runs") && (<>
      <div className="row" style={{ marginBottom: 12 }}>
        <form action={runNow}><button>Run now</button></form>
        <span className="muted">Scheduled every 3 hours. Judge model: {config.judgeModel}. Gate model: {config.gateModel}.</span>
      </div>

      <table>
        <thead><tr><th>#</th><th>Started</th><th>Trigger</th><th>Status</th><th>Sources</th><th>New</th><th>Judged</th><th>Sent</th><th>Error</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{localDateTime(r.startedAt)}</td>
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

      </>)}

      {on("sources") && (<>
      <table>
        <thead><tr><th>Source</th><th>Health</th><th>Last success</th><th>Settings</th></tr></thead>
        <tbody>
          {srcs.map(({ s, c }) => {
            const h = sourceHealth(s);
            return (
              <tr key={s.id}>
                <td><strong>{c.name}</strong> · {s.label} <span className="muted">({s.kind === "page" ? `${s.pageType} page` : s.kind})</span><div className="muted">{s.url}</div></td>
                <td><span className={`chip h-${h.health}`}>{h.health}</span><div className="muted">{h.reason}</div></td>
                <td className="muted">{s.lastSuccessAt ? localDateTime(s.lastSuccessAt) : "never"}</td>
                <td>
                  <form action={updateSource} style={{ display: "grid", gap: 4 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="text" name="url" defaultValue={s.url} />
                    {s.kind === "listing" && <input type="text" name="linkPrefix" defaultValue={s.linkPrefix ?? ""} placeholder="link prefix, e.g. /blog" />}
                    <div className="row">
                      <select name="fetchMode" defaultValue={s.fetchMode} style={{ width: "auto" }}>
                        <option value="http">Plain HTTP</option><option value="browser">Headless browser</option>
                      </select>
                      {s.kind === "page" && (
                        <select name="pageType" defaultValue={s.pageType} style={{ width: "auto" }}>
                          <option value="general">General page</option><option value="pricing">Pricing page</option>
                        </select>
                      )}
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
          <select name="kind" style={{ width: "auto" }}><option value="listing">Blog listing</option><option value="feed">RSS/Atom feed</option><option value="page">Watched page</option><option value="pricing">Pricing page</option></select>
          <div style={{ flex: 2 }}><input type="text" name="url" placeholder="https://..." /></div>
          <div style={{ flex: 1 }}><input type="text" name="label" placeholder="Label" /></div>
          <div style={{ flex: 1 }}><input type="text" name="linkPrefix" placeholder="/blog (listings)" /></div>
          <button>Add source</button>
        </form>
      </div>

      </>)}

      {on("spend") && (
          <table>
            <thead><tr><th>Purpose</th><th>Model</th><th>Calls</th><th>Cost</th></tr></thead>
            <tbody>
              {spend.map((r) => <tr key={r.purpose + r.model}><td>{r.purpose}</td><td>{r.model}</td><td>{r.calls}</td><td>${Number(r.cost).toFixed(2)}</td></tr>)}
              <tr><td colSpan={3}><strong>Total</strong> (cap ${config.budgetPerMonthUsd})</td><td><strong>${total.toFixed(2)}</strong></td></tr>
            </tbody>
          </table>
      )}

      {on("feedback") && (<>
          <table>
            <thead><tr><th>Team</th><th>Rated</th><th>Useful</th></tr></thead>
            <tbody>
              {fb.length === 0 && <tr><td colSpan={3} className="muted">No ratings yet.</td></tr>}
              {fb.map((r) => <tr key={r.team}><td>{r.team}</td><td>{r.total}</td><td>{Math.round((100 * Number(r.useful)) / Number(r.total))}%</td></tr>)}
            </tbody>
          </table>
          <p className="muted">Golden set: <a href="/ops/golden-export?latest=30">Download the latest 30 judged items as golden-set candidates</a>, then add them with <code>npm run golden:export -- --from-file</code> and label each one.</p>
          <p className="muted">Judgments held back because a quote was not in the source: {heldEvidence[0]?.n ?? 0}.</p>
      </>)}

      {on("evals") && (<>
          <p className="muted"><strong>Evals test the judge before a change ships.</strong> The golden set is a list of real and made-up items with the right level for each team. A run judges them all with today&apos;s prompts and model and grades the answers. Compare every run with the <strong>baseline</strong>: the run we last agreed was good.</p>
          {exam.running && <><AutoRefresh /><div className="notice">Running… started {localTime(exam.runningSince!)}. It takes about 2 minutes; this page updates on its own.</div></>}
          {exam.last ? (() => {
            const cmp = compareRuns(exam.last, exam.baseline);
            const tone = { better: "good", same: "", baseline: "", "no-baseline": "", mixed: "warn", worse: "bad" }[cmp.verdict];
            const headline = {
              baseline: "This run is the baseline. Run the evals again after a prompt or model change to compare.",
              "no-baseline": "No baseline yet. If this run looks right, make it the baseline.",
              better: `Better than the baseline on ${cmp.better} number${cmp.better === 1 ? "" : "s"}, worse on none.`,
              same: "Same as the baseline.",
              mixed: `Better than the baseline on ${cmp.better} number${cmp.better === 1 ? "" : "s"}, worse on ${cmp.worse}: ${exam.regressions.join("; ")}.`,
              worse: `Worse than the baseline: ${exam.regressions.join("; ")}.`,
            }[cmp.verdict];
            const arrow = (d: number | null) => d === null || d === 0 ? <span className="muted">no change</span> : d > 0 ? <span className="up">▲ +{d}</span> : <span className="down">▼ {d}</span>;
            return (<>
              <div className={`verdict ${tone}`}>
                <div className="muted">Latest run · {localDateTime(exam.last.when)}</div>
                <strong>{headline}</strong>
                {cmp.newItems.length > 0 && <div className="muted">{cmp.newItems.length} item{cmp.newItems.length === 1 ? " is" : "s are"} new since the baseline, so part of any change can come from them.</div>}
              </div>
              <table>
                <thead><tr><th>Team</th><th>Precision<div className="muted small">of what we send, how much they should get</div></th><th>Recall<div className="muted small">of what they should get, how much we send</div></th><th>Exact level</th><th>Severe misses</th></tr></thead>
                <tbody>
                  {exam.last.scores.map((s) => {
                    const b = exam.baseline?.scores.find((x) => x.team === s.team);
                    const ch = (m: "precision" | "recall") => cmp.changes.find((c) => c.team === s.team && c.metric === m)?.delta ?? null;
                    const cell = (m: "precision" | "recall") => <td><strong>{pct(s[m])}</strong>{b && cmp.verdict !== "baseline" ? <div className="small">baseline {pct(b[m])} · {arrow(ch(m))}</div> : null}</td>;
                    return <tr key={s.team}><td>{s.team}</td>{cell("precision")}{cell("recall")}<td>{s.exact}/{s.graded}</td><td>{s.severe.length}</td></tr>;
                  })}
                </tbody>
              </table>
              <div className="muted small">{exam.last.graded} items · prompt {exam.last.promptVersion} · {exam.last.model} · ${exam.last.costUsd.toFixed(2)}{exam.last.failed.length ? ` · ${exam.last.failed.length} failed` : ""}{exam.last.stories?.length ? ` · same-story links ${exam.last.stories.filter((x) => x.got === x.expected).length}/${exam.last.stories.length} correct` : ""}{exam.last.topics?.length ? ` · topic tags ${exam.last.topics.filter((x) => x.hit).length}/${exam.last.topics.length} fit` : ""}</div>
              <div className="muted small">{exam.baseline ? <>Baseline: the run of {localDateTime(exam.baseline.when)} ({exam.baseline.graded} items, prompt {exam.baseline.promptVersion}).</> : "No baseline saved yet."}</div>

              {cmp.verdict !== "baseline" && cmp.verdict !== "no-baseline" && (
                <div className="card" style={{ marginTop: 12 }}>
                  <strong>What changed since the baseline</strong> <span className="muted">· these explain the numbers above</span>
                  {cmp.newItems.length > 0 && <div style={{ marginTop: 6 }}><strong>{cmp.newItems.length} new item{cmp.newItems.length === 1 ? "" : "s"}</strong> <span className="muted">(not in the baseline run): {cmp.newItems.join(", ")}. Their answers are under &quot;Every disagreement&quot; below.</span></div>}
                  <div style={{ marginTop: 6 }}><strong>{cmp.answers.length} answer{cmp.answers.length === 1 ? "" : "s"} moved</strong> <span className="muted">on items both runs graded.</span></div>
                  {cmp.answers.length === 0 ? <div className="muted">None.</div> : (
                    <table style={{ marginTop: 6 }}><thead><tr><th>Item</th><th>Team</th><th>Answer key</th><th>Baseline → now</th><th>Judge&apos;s reason now</th></tr></thead><tbody>
                      {cmp.answers.map((x) => <tr key={x.id + x.team}><td>{x.id}</td><td>{x.team}</td><td>{x.expected}</td>
                        <td><span style={{ whiteSpace: "nowrap" }}>{x.before} → <strong>{x.after}</strong> {x.after === x.expected ? <span className="up">✓ fixed</span> : x.before === x.expected ? <span className="down">✗ broke</span> : null}</span></td>
                        <td className="muted small">{x.why ?? ""}</td></tr>)}
                    </tbody></table>
                  )}
                </div>
              )}

              {ownerItems.length > 0 && (
                <div className="card" style={{ marginTop: 8 }}>
                  <strong>Added by the owner from team votes</strong> <span className="muted">· {ownerResults.filter((r) => r.agreed).length} of {ownerResults.length} now judged as the owner said</span>
                  <table style={{ marginTop: 6 }}><tbody>{ownerResults.map((r) => {
                    const g = ownerItems.find((x) => x.id === r.id)!;
                    return <tr key={r.id}><td>{g.competitor} · {g.title ?? g.url}</td><td>{r.graded ? r.outcomes.map((o) => <div key={o.team}>{o.team}: owner {o.expected}, judge {o.got} {o.got === o.expected ? "✓" : "✗"}</div>) : <span className="muted">Added after this run; run the evals to grade it</span>}</td></tr>;
                  })}</tbody></table>
                </div>
              )}
              <details><summary className="muted">Every disagreement with the answer key in this run ({exam.last.outcomes.filter((o) => o.got !== o.expected).length})</summary>
                <table><tbody>{exam.last.outcomes.filter((o) => o.got !== o.expected).map((o) => <tr key={o.id + o.team}><td>{o.id}</td><td>{o.team}</td><td>expected {o.expected}</td><td>got {o.got}{o.evidenceOk ? "" : " (no evidence)"}</td><td className="muted">{o.why ?? ""}</td></tr>)}</tbody></table>
              </details>

              <div className="card" style={{ marginTop: 12 }}>
                <strong>Make this run the baseline?</strong>
                <div className="muted">Do it when the run is at least as good as the baseline, or when every drop is explained above (a new item, or a borderline call). Later runs are then compared with this one.</div>
                <div className="row" style={{ marginTop: 8 }}>
                  {cmp.verdict === "baseline"
                    ? <span className="muted">✓ This run is already the baseline.</span>
                    : <form action={saveExamBaseline}><button className="secondary">Make this run the baseline</button></form>}
                </div>
              </div>
            </>);
          })() : <div className="muted">No eval run yet.</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <form action={runExam}><button disabled={exam.running}>{exam.running ? "Running…" : "Run the evals"}</button></form>
            {exam.last && <a href="/ops/evals-report" className="muted">Download the full report (one Markdown file, with the judge&apos;s reasons)</a>}
          </div>
      </>)}

      {on("errors") && (stuck.length === 0 ? <div className="card muted">None.</div> : (
        <table>
          <tbody>
            {stuck.map(({ i, c }) => (
              <tr key={i.id}><td>{c.name}</td><td><a href={i.url}>{i.title ?? i.url}</a></td><td className="muted">{i.status}: {i.statusDetail}</td>
                <td><form action={retryItem}><input type="hidden" name="id" value={i.id} /><button className="secondary">Retry</button></form></td></tr>
            ))}
          </tbody>
        </table>
      ))}

      {on("canary") && (<>
      <p className="muted">A page we control, watched like a competitor page. Edit it to check the whole chain end to end: the next run should detect, judge and deliver the change, labelled as a test.</p>
      <form action={saveCanary} className="card">
        <textarea name="text" defaultValue={canary?.value ?? ""} style={{ minHeight: 140 }} />
        <button style={{ marginTop: 8 }}>Update canary page</button> <a href="/canary" target="_blank">View</a>
      </form>
      <p className="muted">Pricing canary, watched with the pricing skill. One plan per line: <code>Plan | monthly price | yearly price | feature; feature</code>. Change a price, move a feature or add a plan, then run.</p>
      <form action={saveCanaryPricing} className="card">
        <textarea name="text" defaultValue={canaryPricing?.value || DEFAULT_CANARY_PRICING} style={{ minHeight: 100 }} />
        <button style={{ marginTop: 8 }}>Update pricing canary</button> <a href="/canary/pricing" target="_blank">View</a>
      </form>
      </>)}
    </>
  );
}
