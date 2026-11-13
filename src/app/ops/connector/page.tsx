import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { mcpCall } from "@/db/schema";
import { config } from "@/config";
import { ROLE_NAME } from "@/lib/view-as";
import { allViewers } from "@/lib/viewer";
import { tokenFor } from "@/mcp/auth";

export const dynamic = "force-dynamic";

/**
 * Builder only (the proxy keeps /ops behind the builder password): each person's Claude connector address,
 * and the audit log of every call made through it.
 */
export default async function Connector() {
  const d = db();
  const on = !!process.env.MCP_SECRET;
  const people = await allViewers(d);
  const calls = await d.select().from(mcpCall).orderBy(desc(mcpCall.id)).limit(50).catch(() => []);
  return (
    <div>
      <h1>Claude connector</h1>
      <p className="muted">
        Ask about competitors from Claude. Each person gets their own address, which acts as them: a member sees only their team,
        and only owners can add a competitor (preview first, then their confirmation). In Claude: Settings › Connectors › Add custom connector, and paste the address.
        Removing someone from People stops their address at once; rotating MCP_SECRET stops all of them.
      </p>
      {!on ? (
        <div className="notice" style={{ borderColor: "#f3c1c1", background: "#fff3f3" }}>Off: set MCP_SECRET in the Render environment to turn it on.</div>
      ) : (
        <table>
          <thead><tr><th>Person</th><th>Role</th><th>Connector address (keep it secret)</th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.key}>
                <td><strong>{p.name}</strong><div className="muted">{p.title}</div></td>
                <td>{ROLE_NAME[p.role]}{p.team ? ` · ${p.team}` : ""}</td>
                <td><input type="text" readOnly value={`${config.publicUrl}/api/mcp/${tokenFor(p.key)}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 style={{ marginTop: 24 }}>Every call</h2>
      <table>
        <thead><tr><th>When (UTC)</th><th>Who</th><th>Tool</th><th>Effect</th><th>Arguments</th><th>Result</th></tr></thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td className="muted">{c.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td>{c.personKey} <span className="muted">({c.role})</span></td>
              <td>{c.tool}</td>
              <td>{c.effect === "write" ? <strong>write</strong> : c.effect}</td>
              <td className="muted"><code>{JSON.stringify(c.args).slice(0, 120)}</code></td>
              <td>{c.ok ? "ok" : <span style={{ color: "#b42318" }}>{c.error}</span>}</td>
            </tr>
          ))}
          {calls.length === 0 && <tr><td colSpan={6} className="muted">No calls yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
