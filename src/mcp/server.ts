import { z } from "zod";
import type { DB } from "@/db/client";
import { mcpCall } from "@/db/schema";
import type { Viewer } from "@/lib/view-as";
import { rateLimited } from "./auth";
import { TOOLS, ToolError, UNTRUSTED } from "./tools";

/**
 * A small Model Context Protocol server over Streamable HTTP, stateless: every POST carries one JSON-RPC
 * message (or a batch) and gets a JSON answer. No sessions, no server-sent events, nothing kept between
 * calls. That is all a read-mostly connector needs, and it keeps the attack surface small.
 */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SERVER_INFO = { name: "competitor-monitor", title: "Competitor Monitor", version: "1.0.0" };

export const INSTRUCTIONS =
  "Competitor Monitor watches Noma Security's competitors and judges every new post or page change once per team " +
  "(Marketing, Product, R&D) as Urgent, Worth knowing or FYI, with the reason and verbatim quotes. " +
  "Answer from the tools, lead with what matters most, and give the quote and link for each claim. " +
  UNTRUSTED +
  " Only add_competitor changes anything, and only after the user approved its preview in this conversation.";

type Id = string | number | null;
interface Rpc { jsonrpc: "2.0"; id?: Id; method: string; params?: Record<string, unknown> }
const ok = (id: Id, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const fail = (id: Id, code: number, message: string) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });

export interface McpCtx { db: DB; viewer: Viewer; now?: Date }

const visible = (v: Viewer) => TOOLS.filter((t) => t.allowed(v));

function describe(t: (typeof TOOLS)[number]) {
  const schema = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: schema,
    annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: !t.readOnly },
  };
}

async function callTool(ctx: McpCtx, params: Record<string, unknown> | undefined) {
  const name = String(params?.name ?? "");
  const args = (params?.arguments ?? {}) as Record<string, unknown>;
  const tool = TOOLS.find((t) => t.name === name);
  const log = (okay: boolean, effect: string, error?: string) =>
    ctx.db.insert(mcpCall).values({ personKey: ctx.viewer.key, role: ctx.viewer.role, tool: name || "(none)", args, ok: okay, effect, error }).catch(() => undefined);

  // A tool someone may not use is reported as unknown, so its existence isn't confirmed either.
  if (!tool || !tool.allowed(ctx.viewer)) {
    await log(false, "denied", "unknown or not allowed");
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
  if (rateLimited(`call:${ctx.viewer.key}`, 60, 60e3) || (!tool.readOnly && rateLimited(`write:${ctx.viewer.key}`, 10, 3600e3))) {
    await log(false, "limited", "rate limit");
    return { isError: true, content: [{ type: "text", text: "Too many requests. Try again in a minute." }] };
  }
  try {
    const { data, effect } = await tool.run({ db: ctx.db, viewer: ctx.viewer, now: ctx.now ?? new Date() }, args);
    await log(true, effect);
    return {
      content: [{ type: "text", text: JSON.stringify({ note: UNTRUSTED, ...((data && typeof data === "object" && !Array.isArray(data)) ? data : { items: data }) }) }],
    };
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : e instanceof z.ZodError ? `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` : "Something went wrong on our side.";
    await log(false, "error", e instanceof Error ? e.message.slice(0, 500) : String(e));
    return { isError: true, content: [{ type: "text", text: msg }] };
  }
}

async function handleOne(ctx: McpCtx, m: Rpc) {
  const id = m.id ?? null;
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: `${INSTRUCTIONS} You are connected as ${ctx.viewer.name} (${ctx.viewer.role}${ctx.viewer.team ? `, ${ctx.viewer.team}` : ""}).`,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: visible(ctx.viewer).map(describe) });
    case "tools/call":
      return ok(id, await callTool(ctx, m.params));
    default:
      return fail(id, -32601, `Method not found: ${m.method}`);
  }
}

/** Handles a parsed request body. Returns null when nothing needs an answer (only notifications). */
export async function handleMcp(ctx: McpCtx, body: unknown): Promise<unknown | null> {
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as unknown[];
  if (msgs.length === 0 || msgs.length > 20) return fail(null, -32600, "Invalid request");
  const out = [];
  for (const raw of msgs) {
    const m = raw as Partial<Rpc>;
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      if (m && "id" in m && ("result" in m || "error" in m)) continue; // a response from the client: nothing to do
      out.push(fail((m as Rpc | undefined)?.id ?? null, -32600, "Invalid request"));
      continue;
    }
    if (m.id === undefined) continue; // a notification, e.g. notifications/initialized
    out.push(await handleOne(ctx, m as Rpc));
  }
  if (out.length === 0) return null;
  return batch ? out : out[0];
}
