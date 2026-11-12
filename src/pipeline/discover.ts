import type { SourceKind } from "../db/schema";
import { extractListingLinks, feedLinks, parseFeed } from "./extract";
import { fetchSource } from "./fetch";

export interface Proposed {
  kind: SourceKind;
  url: string;
  label: string;
  linkPrefix?: string;
  sample: string[];
}

const LISTING_PATHS = ["/blog", "/news", "/newsroom", "/press", "/resources/blog", "/insights", "/research"];

/**
 * Finds where a competitor publishes, from nothing but its domain, so the business owner
 * can add a competitor without knowing what a feed or a selector is.
 * Order of preference: an advertised RSS/Atom feed, then a blog-like listing page, and always the homepage.
 */
export async function discoverSources(domain: string): Promise<{ sources: Proposed[]; notes: string[] }> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const notes: string[] = [];
  const sources: Proposed[] = [];
  let homeUrl = `https://${host}/`;
  let home = await fetchSource(homeUrl, "http");
  if (!home.ok && !host.startsWith("www.")) {
    homeUrl = `https://www.${host}/`;
    home = await fetchSource(homeUrl, "http");
  }
  if (!home.ok) {
    notes.push(`Could not open ${host} (${home.error ?? home.status}). An operator needs to look at this competitor.`);
    return { sources, notes };
  }
  sources.push({ kind: "page", url: home.url, label: "Homepage", sample: [] });

  for (const f of feedLinks(home.body, home.url).slice(0, 3)) {
    const r = await fetchSource(f, "http");
    if (!r.ok) continue;
    try {
      const entries = await parseFeed(r.body, r.url);
      if (entries.length > 0) {
        sources.push({ kind: "feed", url: r.url, label: "News feed", sample: entries.slice(0, 5).map((e) => e.title ?? e.url) });
        break;
      }
    } catch {
      // not a real feed; keep looking
    }
  }
  if (sources.some((s) => s.kind === "feed")) return { sources, notes };

  const origin = new URL(home.url).origin;
  for (const path of LISTING_PATHS) {
    const r = await fetchSource(origin + path, "http");
    if (!r.ok) continue;
    const prefix = new URL(r.url).pathname.replace(/\/$/, "") || path;
    const links = extractListingLinks(r.body, r.url, prefix);
    if (links.length >= 3) {
      sources.push({ kind: "listing", url: r.url, label: path.includes("press") || path.includes("news") ? "News" : "Blog", linkPrefix: prefix, sample: links.slice(0, 5).map((l) => l.title ?? l.url) });
      break;
    }
    const feeds = feedLinks(r.body, r.url);
    if (feeds[0]) {
      const fr = await fetchSource(feeds[0], "http");
      const entries = fr.ok ? await parseFeed(fr.body, fr.url).catch(() => []) : [];
      if (entries.length > 0) {
        sources.push({ kind: "feed", url: fr.url, label: "News feed", sample: entries.slice(0, 5).map((e) => e.title ?? e.url) });
        break;
      }
    }
  }
  if (sources.length === 1) notes.push("No blog or news page found automatically; only the homepage is watched. An operator can add a source.");
  return { sources, notes };
}
