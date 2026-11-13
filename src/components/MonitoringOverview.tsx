import { ALERT_RULES, type Metric, type MetricGroup } from "@/lib/monitoring";

const GROUPS: MetricGroup[] = ["Availability", "Reliability", "AI quality", "Cost"];
const STATUS_LABEL = { ok: "On target", warn: "Near the line", bad: "Off target", none: "No data yet" } as const;

/** The Builder's overview: eight numbers with targets, then the alert rules that watch them. */
export function MonitoringOverview({ metrics, recentAlerts }: { metrics: Metric[]; recentAlerts: { at: Date; key: string }[] }) {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const off = metrics.filter((m) => m.status === "bad" || m.status === "warn").length;
  const active = ALERT_RULES.filter((r) => r.state === "active").length;
  return (
    <>
      <div className={`notice mon-summary mon-${off ? "warn" : "ok"}`}>
        {off ? `${off} of ${metrics.length} metrics need a look.` : `All ${metrics.length} metrics are on target or waiting for data.`}
        <span className="muted"> {active} alert rules active, {ALERT_RULES.length - active} drafts. Last ops alert: {recentAlerts[0] ? recentAlerts[0].at.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "none yet"}.</span>
      </div>

      <div className="mon-grid">
        {GROUPS.map((g) => (
          <section key={g} className="mon-group">
            <h3>{g}</h3>
            {metrics.filter((m) => m.group === g).map((m) => (
              <a key={m.key} href={m.href} className={`mon-tile mon-${m.status}`}>
                <div className="mon-label">{m.label}</div>
                <div className="mon-value">{m.value}</div>
                <div className="mon-target"><span className="mon-dot" />{STATUS_LABEL[m.status]} · target {m.target}</div>
                <div className="muted mon-detail">{m.detail}</div>
                <div className="mon-source">from {m.source}</div>
              </a>
            ))}
          </section>
        ))}
      </div>

      <div className="row" style={{ marginTop: 24, alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Alert rules</h2>
        <span className="muted">Condition, evaluation, pending period, severity, channel: the same shape as Grafana alert rules and Datadog monitors.</span>
      </div>
      <table className="mon-rules">
        <thead><tr><th>Rule</th><th>Metric</th><th>Condition</th><th>Evaluate</th><th>Pending for</th><th>Severity</th><th>Notify</th><th>State</th></tr></thead>
        <tbody>
          {ALERT_RULES.map((r) => (
            <tr key={r.name}>
              <td><strong>{r.name}</strong>{r.where && <div className="muted">runs in {r.where}</div>}</td>
              <td><a href={r.runbook}>{byKey.get(r.metric)?.label ?? r.metric}</a></td>
              <td>{r.condition}</td>
              <td className="muted">{r.evaluate}</td>
              <td className="muted">{r.pendingFor}</td>
              <td><span className={`chip sev-${r.severity}`}>{r.severity}</span></td>
              <td>{r.notify}</td>
              <td><span className={`chip rule-${r.state}`}>{r.state === "active" ? "Active" : "Draft"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="card mon-new">
        <summary><strong>+ New rule</strong> <span className="muted">Preview: rules are defined in code today; saving from here comes next.</span></summary>
        <fieldset disabled className="mon-form">
          <label>Name<input type="text" placeholder="e.g. Pricing pages failing" /></label>
          <label>Metric<select defaultValue="coverage">{metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
          <label>Condition<div className="row"><select defaultValue="lt" style={{ width: "auto" }}><option value="lt">is below</option><option value="gt">is above</option></select><input type="text" defaultValue="90%" style={{ width: 90 }} /></div></label>
          <label>Evaluate every<select defaultValue="run"><option value="run">Each run</option><option>Hour</option><option>Day</option></select></label>
          <label>Pending for<select defaultValue="2"><option value="0">Fire at once</option><option value="2">2 runs in a row</option><option>1 day</option></select></label>
          <label>Severity<select defaultValue="warning"><option>critical</option><option>warning</option><option>info</option></select></label>
          <label>Notify<select defaultValue="ops"><option value="ops">#competitors-ops (Slack)</option><option>Owners&apos; channel</option><option>Email</option><option>PagerDuty</option></select></label>
          <label>Runbook link<input type="text" placeholder="/ops/sources" /></label>
          <div className="row"><button>Save rule</button><button className="secondary">Send test alert</button></div>
        </fieldset>
      </details>
      <p className="muted">Next step: send these numbers to Grafana Cloud for history and on-call routing; see the design doc, section 7.</p>
    </>
  );
}
