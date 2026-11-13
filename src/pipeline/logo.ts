import { JSDOM, VirtualConsole } from "jsdom";
import { eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { competitor, competitorLogo } from "../db/schema";
import { config } from "../config";
import { fetchSource } from "./fetch";
import { assertPublicUrl } from "./urlguard";

const MAX_BYTES = 200_000;
const quiet = new VirtualConsole();

/**
 * Where a site's icon may be, best first: the large touch icon, then declared icons (largest first, SVG
 * counts as large), then /favicon.ico, then Google's icon service, which reads the page for us.
 */
export function logoCandidates(html: string, pageUrl: string): string[] {
  const doc = new JSDOM(html, { url: pageUrl, virtualConsole: quiet }).window.document;
  const declared = [...doc.querySelectorAll("link[rel][href]")]
    .map((l) => {
      const rel = (l.getAttribute("rel") ?? "").toLowerCase();
      if (!/\bicon\b|apple-touch-icon/.test(rel)) return null;
      const href = new URL(l.getAttribute("href")!, pageUrl).toString();
      const size = Number((l.getAttribute("sizes") ?? "").split("x")[0]) || 0;
      const score = rel.includes("apple-touch-icon") ? 180 : /\.svg(\?|$)/i.test(href) || l.getAttribute("type") === "image/svg+xml" ? 150 : size || 32;
      return { href, score };
    })
    .filter((x): x is { href: string; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.href);
  const origin = new URL(pageUrl).origin;
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  return [...new Set([...declared, `${origin}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${host}&sz=128`])];
}

async function fetchImage(url: string): Promise<{ contentType: string; data: string } | null> {
  await assertPublicUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": config.userAgent } });
    // Google answers an unknown site with 404 and a generic globe: no icon.
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > MAX_BYTES) return null;
    const isSvg = type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?<svg/i.test(buf.subarray(0, 200).toString("utf8"));
    if (!type.startsWith("image/") && !isSvg && !/\.ico(\?|$)/.test(url)) return null;
    return { contentType: isSvg ? "image/svg+xml" : type.startsWith("image/") ? type : "image/x-icon", data: buf.toString("base64") };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Finds a competitor's logo on its site and keeps it. Never throws; returns whether a logo was saved. */
export async function saveLogo(db: DB, competitorId: number, domain: string): Promise<boolean> {
  try {
    let home = await fetchSource(`https://${domain}/`, "http");
    if (!home.ok) home = await fetchSource(`https://www.${domain}/`, "http");
    const candidates = home.ok ? logoCandidates(home.body, home.url) : [`https://www.google.com/s2/favicons?domain=${domain}&sz=128`];
    for (const url of candidates.slice(0, 6)) {
      const img = await fetchImage(url);
      if (!img) continue;
      await db.insert(competitorLogo).values({ competitorId, ...img, sourceUrl: url })
        .onConflictDoUpdate({ target: competitorLogo.competitorId, set: { ...img, sourceUrl: url, fetchedAt: new Date() } });
      return true;
    }
  } catch (e) {
    console.error(`logo for ${domain} failed`, e);
  }
  return false;
}

/** Fetches logos for competitors that don't have one yet (added before logos were kept, or whose fetch failed). */
export async function fillMissingLogos(db: DB) {
  const missing = await db
    .select({ id: competitor.id, domain: competitor.domain })
    .from(competitor)
    .leftJoin(competitorLogo, eq(competitorLogo.competitorId, competitor.id))
    .where(isNull(competitorLogo.competitorId));
  for (const c of missing) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain)) await saveLogo(db, c.id, c.domain);
  }
}
