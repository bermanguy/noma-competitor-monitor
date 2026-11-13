import { db } from "@/db/client";
import { config } from "@/config";
import { rateLimited, viewerForToken } from "./auth";
import { handleMcp } from "./server";

/**
 * The HTTP side of the connector. Token from the URL path (for claude.ai custom connectors, which take a
 * URL) or an Authorization: Bearer header (for Claude Code and other clients).
 */
const ALLOWED_ORIGINS = ["https://claude.ai", "https://claude.com", config.publicUrl];

export async function serveMcp(req: Request, pathToken?: string): Promise<Response> {
  if (!process.env.MCP_SECRET) return json({ error: "The Claude connector is turned off on this server." }, 503);
  // Browsers send Origin; a page on another site must not be able to drive the connector (DNS rebinding).
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = pathToken ?? bearer;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`auth:${ip}`, 120, 60e3)) return json({ error: "Too many requests" }, 429);
  const viewer = await viewerForToken(token, db());
  if (!viewer) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked connector token" } }, 401, { "WWW-Authenticate": 'Bearer realm="competitor-monitor"' });
  }
  const text = await req.text();
  if (text.length > 64_000) return json({ error: "Request too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const answer = await handleMcp({ db: db(), viewer }, body);
  return answer === null ? new Response(null, { status: 202 }) : json(answer, 200);
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
