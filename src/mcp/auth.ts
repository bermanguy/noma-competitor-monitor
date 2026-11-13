import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "@/db/client";
import { BUILDER, type Viewer } from "@/lib/view-as";
import { allViewers } from "@/lib/viewer";

/**
 * One connector token per person: "nmcp_<person key>_<signature>". The signature is an HMAC of the key
 * with MCP_SECRET, so no token is stored anywhere and the server can check one without a lookup.
 * - A token acts as exactly that person, with that person's role and team.
 * - Removing the person from People stops their token at once (they are no longer a viewer).
 * - Rotating MCP_SECRET revokes every token.
 * Without MCP_SECRET the connector is off.
 */
const PREFIX = "nmcp_";

function sign(key: string, secret: string) {
  return createHmac("sha256", secret).update(`mcp:${key}`).digest("hex").slice(0, 40);
}

export function tokenFor(key: string, secret = process.env.MCP_SECRET): string {
  if (!secret) throw new Error("MCP_SECRET is not set");
  return `${PREFIX}${key}_${sign(key, secret)}`;
}

/** The person a token belongs to, or null. Never falls back to the builder for an unknown key. */
export async function viewerForToken(token: string | null | undefined, d: DB, secret = process.env.MCP_SECRET): Promise<Viewer | null> {
  if (!secret || !token?.startsWith(PREFIX)) return null;
  const rest = token.slice(PREFIX.length);
  const cut = rest.lastIndexOf("_");
  if (cut <= 0) return null;
  const key = rest.slice(0, cut);
  const given = Buffer.from(rest.slice(cut + 1));
  const want = Buffer.from(sign(key, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  if (key === BUILDER.key) return BUILDER;
  return (await allViewers(d)).find((v) => v.key === key && v.key !== BUILDER.key) ?? null;
}

/** Small in-memory limit per person and bucket. Enough for one web instance; a shared store at scale. */
const hits = new Map<string, number[]>();
export function rateLimited(bucket: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(bucket, recent); return true; }
  recent.push(now);
  hits.set(bucket, recent);
  return false;
}
