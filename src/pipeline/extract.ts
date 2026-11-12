import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import Parser from "rss-parser";
import { canonicalUrl } from "./text";

const quiet = new VirtualConsole();

function dom(html: string, url: string) {
  return new JSDOM(html, { url, virtualConsole: quiet });
}

function publishedFrom(doc: Document): Date | null {
  const metas = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]',
  ];
  for (const sel of metas) {
    const v = doc.querySelector(sel)?.getAttribute("content");
    const d = v ? new Date(v) : null;
    if (d && !isNaN(d.getTime())) return d;
  }
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const m = s.textContent?.match(/"datePublished"\s*:\s*"([^"]+)"/);
    const d = m?.[1] ? new Date(m[1]) : null;
    if (d && !isNaN(d.getTime())) return d;
  }
  const t = doc.querySelector("article time[datetime], main time[datetime]")?.getAttribute("datetime");
  const d = t ? new Date(t) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

export interface Extracted {
  title: string | null;
  text: string;
  publishedAt: Date | null;
}

const CHROME = "script,style,noscript,template,nav,footer,svg,iframe,form,dialog,[role=navigation],[role=dialog],[aria-hidden=true],[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i]";

/**
 * Main content as plain text, one line per block.
 * - "article" (blog posts): Readability picks the article body.
 * - "page" (homepage, product page): the whole page minus navigation, footer, scripts and cookie banners.
 *   Readability is not used here because it drops hero headlines, which is exactly where messaging changes.
 */
export function extractMain(html: string, url: string, mode: "article" | "page" = "article"): Extracted {
  const doc = dom(html, url).window.document;
  const publishedAt = mode === "article" ? publishedFrom(doc) : null;
  let title: string | null = doc.title || null;
  let text = "";
  if (mode === "article") {
    const article = new Readability(doc.cloneNode(true) as Document, { charThreshold: 200 }).parse();
    if (article?.content) {
      text = blockText(dom(article.content, url).window.document.body);
      title = article.title || title;
    }
  }
  if (text.length < 200) {
    for (const el of doc.querySelectorAll(CHROME)) el.remove();
    text = blockText(doc.body);
  }
  return { title: title?.trim() || null, text, publishedAt };
}

/** Text with a newline per block element, so diffs work line by line. */
function blockText(root: Element | null): string {
  if (!root) return "";
  const out: string[] = [];
  const BLOCK = /^(P|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE|DIV|SECTION|ARTICLE|DT|DD|FIGCAPTION)$/;
  const walk = (node: Node, buf: string[]) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) buf.push(child.textContent ?? "");
      else if (child.nodeType === 1) {
        const el = child as Element;
        if (BLOCK.test(el.tagName)) {
          const inner: string[] = [];
          walk(el, inner);
          const s = inner.join("").replace(/\s+/g, " ").trim();
          if (s) out.push(s);
        } else walk(el, buf);
      }
    }
  };
  const top: string[] = [];
  walk(root, top);
  const rest = top.join("").replace(/\s+/g, " ").trim();
  if (rest) out.push(rest);
  return out.join("\n");
}

export interface DiscoveredLink {
  url: string;
  title: string | null;
}

/**
 * Article links on a blog listing: same site, path under the prefix, deeper than the prefix itself,
 * not a category, tag or pagination page.
 */
export function extractListingLinks(html: string, pageUrl: string, prefix: string): DiscoveredLink[] {
  const doc = dom(html, pageUrl).window.document;
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./, "");
  const seen = new Map<string, DiscoveredLink>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const url = canonicalUrl(a.getAttribute("href")!, pageUrl);
    if (!url) continue;
    const u = new URL(url);
    if (u.hostname !== host) continue;
    const path = u.pathname.replace(/\/$/, "");
    const pre = prefix.replace(/\/$/, "");
    if (!path.startsWith(pre + "/")) continue;
    const rest = path.slice(pre.length + 1);
    if (!rest || /^(page|category|categories|tag|tags|author|topics?)(\/|$)/i.test(rest)) continue;
    if (u.search && /page=|category=|tag=/i.test(u.search)) continue;
    const title = a.textContent?.replace(/\s+/g, " ").trim() || null;
    const prev = seen.get(url);
    if (!prev || (title && (!prev.title || title.length > prev.title.length))) seen.set(url, { url, title });
  }
  return [...seen.values()];
}

export interface FeedEntry {
  url: string;
  title: string | null;
  publishedAt: Date | null;
}

export async function parseFeed(xml: string, feedUrl: string): Promise<FeedEntry[]> {
  const feed = await new Parser().parseString(xml);
  return feed.items
    .map((i) => {
      const url = i.link ? canonicalUrl(i.link, feedUrl) : null;
      const d = i.isoDate ? new Date(i.isoDate) : null;
      return url ? { url, title: i.title?.trim() || null, publishedAt: d && !isNaN(d.getTime()) ? d : null } : null;
    })
    .filter((x): x is FeedEntry => x !== null);
}

/** Feed URLs advertised by a page. Used when a competitor is added. */
export function feedLinks(html: string, pageUrl: string): string[] {
  const doc = dom(html, pageUrl).window.document;
  return [...doc.querySelectorAll('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]')]
    .map((l) => canonicalUrl(l.getAttribute("href") ?? "", pageUrl))
    .filter((u): u is string => !!u);
}
