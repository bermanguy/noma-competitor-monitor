import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Outbound fetches go to the public internet only. The canary is served publicly, so it passes too. */
export async function assertPublicUrl(raw: string): Promise<void> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`unsupported protocol ${u.protocol}`);
  if (process.env.ALLOW_PRIVATE_FETCH === "1") return; // local development and tests only
  const host = u.hostname;
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.some(isPrivate)) throw new Error(`refusing to fetch private address for ${host}`);
}
