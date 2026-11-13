import { JSDOM, VirtualConsole } from "jsdom";
import type { PageType, SourceKind } from "../db/schema";
import { extractListingLinks, extractMain, feedLinks, parseFeed } from "./extract";
import { fetchSource, type FetchResult } from "./fetch";
import { canonicalUrl } from "./text";

/** What a proposed page is for, in the owner's words: new posts, a product page, pricing, or the homepage. */
export type SourceRole = "homepage" | "posts" | "product" | "pricing";

export interface Proposed {
  kind: SourceKind;
  url: string;
  label: string;
  role: SourceRole;
  pageType: PageType;
  /** For listings: only links under this path count as posts. It can differ from the listing's own path (a /newsroom that lists /news/...). */
  linkPrefix?: string;
  /** Latest post titles, shown as proof that reading works. */
  sample: string[];
  /** Suggested on by default; the owner can change it. */
  checked: boolean;
}

export interface Discovery {
  homeUrl: string | null;
  sources: Proposed[];
  notes: string[];
}

type Fetcher = (url: string) => Promise<FetchResult>;
const httpFetch: Fetcher = (url) => fetchSource(url, "http");

/** Guessed when the homepage menu doesn't link a blog or news page. */
const GUESSED_POSTS = ["/blog", "/news", "/newsroom", "/press", "/resources/blog", "/insights", "/research"];
const GUESSED_PRICING = ["/pricing", "/plans"];

const POSTS_SEG = /^(blogs?|news|newsroom|press|press-releases|media|insights?|research|resources|innovation-hub|articles|updates|stories|labs|announcements|learn)$/i;
const POSTS_TEXT = /^(blog|news|newsroom|press|press releases|insights|research|resources|innovation hub|articles|labs)$/i;
const PRODUCT_SEG = /^(platform|products?|solutions?|features?|use-cases?|capabilities|why-[a-z-]+)$/i;
const PRICING_SEG = /^(pricing|plans|prices)$/i;
const SKIP_SEG = /^(careers?|jobs|legal|privacy|terms|cookies?|login|signin|sign-in|signup|sign-up|contact|contact-us|demo|book-a-demo|request-a-demo|get-a-demo|support|docs|documentation|status|trust|security|events?|webinars?|partners?|about|about-us|company|team|search|cart)$/i;

const MAX_POSTS = 3;
const MAX_PRODUCT = 6;
const CHECKED_PRODUCT = 3;

const quiet = new VirtualConsole();

interface SiteLink {
  url: string;
  path: string;
  segs: string[];
  text: string;
}

const hostOf = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");

/** Same-site links on a page, with their visible text. */
export function siteLinks(html: string, pageUrl: string): SiteLink[] {
  const doc = new JSDOM(html, { url: pageUrl, virtualConsole: quiet }).window.document;
  const host = hostOf(pageUrl);
  const seen = new Map<string, SiteLink>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const url = canonicalUrl(a.getAttribute("href")!, pageUrl);
    if (!url) continue;
    const u = new URL(url);
    if (u.hostname !== host || u.search) continue;
    const path = u.pathname.replace(/\/$/, "");
    if (!path || /\.(pdf|png|jpe?g|svg|zip|mp4)$/i.test(path)) continue;
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    const prev = seen.get(url);
    if (!prev || (!prev.text && text)) seen.set(url, { url, path, segs: path.split("/").filter(Boolean), text });
  }
  return [...seen.values()];
}

/** Sorts homepage links into blog/news candidates, product pages and pricing, by address and link text. */
export function classifyLinks(links: SiteLink[]): { posts: SiteLink[]; product: SiteLink[]; pricing: SiteLink[] } {
  const posts: SiteLink[] = [];
  const product: SiteLink[] = [];
  const pricing: SiteLink[] = [];
  for (const l of links) {
    const [first] = l.segs;
    if (!first || l.segs.length > 2 || SKIP_SEG.test(first)) continue;
    const last = l.segs[l.segs.length - 1]!;
    if (PRICING_SEG.test(first) || /^pricing$/i.test(l.text)) pricing.push(l);
    else if ((POSTS_SEG.test(first) && (l.segs.length === 1 || POSTS_SEG.test(last))) || POSTS_TEXT.test(l.text)) posts.push(l);
    else if (PRODUCT_SEG.test(first)) product.push(l);
  }
  // Top-level pages first (/platform before /solutions/ciso): they are the broadest messaging.
  product.sort((a, b) => a.segs.length - b.segs.length);
  return { posts, product, pricing };
}

/** An article address: a long, hyphenated last part, as in /news/hiddenlayer-raises-series-b. */
const looksLikeArticle = (seg: string) => seg.length >= 12 && seg.includes("-");

/**
 * Where a listing's articles live. Usually under the listing's own path (/blog → /blog/...),
 * but some sites list elsewhere (/newsroom → /news/..., /innovation-hub → /insight/...).
 * Returns the prefix the collector will use, and the articles it would see.
 */
export function findPosts(html: string, pageUrl: string): { prefix: string; links: { url: string; title: string | null }[] } | null {
  const own = new URL(pageUrl).pathname.replace(/\/$/, "");
  if (own) {
    const links = extractListingLinks(html, pageUrl, own);
    if (links.length >= 3) return { prefix: own, links };
  }
  const groups = new Map<string, number>();
  for (const l of siteLinks(html, pageUrl)) {
    if (l.segs.length < 2 || !looksLikeArticle(l.segs[l.segs.length - 1]!)) continue;
    const parent = "/" + l.segs.slice(0, -1).join("/");
    if (SKIP_SEG.test(l.segs[0]!) || PRODUCT_SEG.test(l.segs[0]!)) continue;
    groups.set(parent, (groups.get(parent) ?? 0) + 1);
  }
  const best = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 3) return null;
  const links = extractListingLinks(html, pageUrl, best[0]);
  return links.length >= 3 ? { prefix: best[0], links } : null;
}

const titleCase = (seg: string) => seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function labelFor(l: { segs: string[]; text: string }, fallback: string) {
  const t = l.text.replace(/[→›»]+/g, "").trim();
  if (t && t.length <= 28 && !/^(learn more|read more|see all|view all|explore|more|resources|company|learn)$/i.test(t)) return t;
  return l.segs.length ? l.segs.map(titleCase).join(" · ") : fallback;
}

/**
 * Finds the pages worth watching on a competitor's site, from nothing but its domain.
 * Reads the homepage menu for blog/news, product and pricing pages, confirms each one opens,
 * and for blog/news pages finds where the articles actually live. Writes nothing: the owner picks.
 */
export async function discoverSources(domain: string, fetcher: Fetcher = httpFetch): Promise<Discovery> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const notes: string[] = [];
  const sources: Proposed[] = [];
  let home = await fetcher(`https://${host}/`);
  if (!home.ok && !host.startsWith("www.")) home = await fetcher(`https://www.${host}/`);
  if (!home.ok) {
    notes.push(`Could not open ${host} (${home.error ?? home.status}). Check the address, or add pages by hand.`);
    return { homeUrl: null, sources, notes };
  }
  const homeUrl = home.url;
  const origin = new URL(homeUrl).origin;
  sources.push({ kind: "page", url: homeUrl, label: "Homepage", role: "homepage", pageType: "general", sample: [], checked: true });

  const nav = classifyLinks(siteLinks(home.body, homeUrl));
  const seenUrls = new Set([canonicalUrl(homeUrl)]);

  // Blog and news: an advertised feed first, then listing pages from the menu, then common addresses.
  const posts: Proposed[] = [];
  for (const f of feedLinks(home.body, homeUrl).slice(0, 3)) {
    const r = await fetcher(f);
    if (!r.ok) continue;
    const entries = await parseFeed(r.body, r.url).catch(() => []);
    if (entries.length > 0) {
      posts.push({ kind: "feed", url: r.url, label: "News feed", role: "posts", pageType: "general", sample: entries.slice(0, 3).map((e) => e.title ?? e.url), checked: true });
      break;
    }
  }
  const candidates = [
    ...nav.posts.map((l) => ({ url: origin + l.path, label: labelFor(l, "Blog") })),
    ...GUESSED_POSTS.map((p) => ({ url: origin + p, label: titleCase(p.split("/").pop()!) })),
  ].filter((c, i, all) => all.findIndex((o) => canonicalUrl(o.url) === canonicalUrl(c.url)) === i).slice(0, 9);
  const listings = await Promise.all(
    candidates.map(async (c) => {
      const r = await fetcher(c.url);
      if (!r.ok) return null;
      const found = findPosts(r.body, r.url);
      return found ? { ...c, url: r.url, found } : null;
    }),
  );
  const prefixes = new Set<string>();
  for (const l of listings) {
    if (!l || posts.length >= MAX_POSTS) continue;
    const key = canonicalUrl(l.url);
    if (prefixes.has(l.found.prefix) || seenUrls.has(key)) continue;
    prefixes.add(l.found.prefix);
    seenUrls.add(key);
    posts.push({
      kind: "listing", url: l.url, label: l.label, role: "posts", pageType: "general", linkPrefix: l.found.prefix,
      sample: l.found.links.slice(0, 3).map((x) => x.title ?? x.url), checked: posts.length < 2,
    });
  }
  sources.push(...posts);

  // Product and pricing pages: kept only if they open and have real text.
  const opens = async (url: string) => {
    const r = await fetcher(url);
    return r.ok && extractMain(r.body, r.url, "page").text.length >= 100 ? r.url : null;
  };
  const productLinks = nav.product.filter((l) => !seenUrls.has(l.url)).slice(0, MAX_PRODUCT);
  const productOk = await Promise.all(productLinks.map((l) => opens(origin + l.path)));
  let checkedProducts = 0;
  productLinks.forEach((l, i) => {
    const url = productOk[i];
    if (!url || seenUrls.has(canonicalUrl(url))) return;
    seenUrls.add(canonicalUrl(url));
    const checked = checkedProducts < CHECKED_PRODUCT;
    if (checked) checkedProducts++;
    sources.push({ kind: "page", url, label: labelFor(l, "Product"), role: "product", pageType: "general", sample: [], checked });
  });

  const pricingTries = [...nav.pricing.map((l) => origin + l.path), ...GUESSED_PRICING.map((p) => origin + p)];
  for (const u of pricingTries.filter((u, i, all) => all.indexOf(u) === i)) {
    const url = await opens(u);
    if (url) {
      sources.push({ kind: "page", url, label: "Pricing", role: "pricing", pageType: "pricing", sample: [], checked: true });
      break;
    }
  }

  if (!posts.length) notes.push("No blog or news page found. If they have one, paste its address.");
  if (!sources.some((s) => s.role === "pricing")) notes.push("No public pricing page found.");
  return { homeUrl, sources, notes };
}
