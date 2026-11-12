import { createHash } from "node:crypto";

const MONTHS = "(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)";

/**
 * Removes things that change without meaning anything: whitespace, dates, times,
 * "3 days ago", copyright years. Prices, limits and other numbers are kept on purpose:
 * a changed number can be the most important change on a page.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(new RegExp(`\\b${MONTHS}\\.? \\d{1,2},? \\d{4}\\b`, "gi"), "<date>")
    .replace(new RegExp(`\\b\\d{1,2} ${MONTHS}\\.?,? \\d{4}\\b`, "gi"), "<date>")
    .replace(/\b\d{4}-\d{2}-\d{2}(t[\d:.]+z?)?\b/gi, "<date>")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "<date>")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?\b/gi, "<time>")
    .replace(/\b\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/gi, "<ago>")
    .replace(/(©|copyright)\s*\d{4}(\s*[-–]\s*\d{4})?/gi, "©")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** Splits text into comparable units: lines, and long lines into sentences. */
export function units(text: string): string[] {
  return text
    .split("\n")
    .flatMap((l) => (l.length > 200 ? l.split(/(?<=[.!?])\s+/) : [l]))
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Diff {
  removed: string[];
  added: string[];
  /** Characters in removed plus added units. */
  size: number;
}

/** Set-based unit diff. Reordering identical units counts as no change, by design. */
export function diffText(before: string, after: string): Diff {
  const a = units(before);
  const b = units(after);
  const bSet = new Set(b);
  const aSet = new Set(a);
  const removed = a.filter((u) => !bSet.has(u));
  const added = b.filter((u) => !aSet.has(u));
  const size = [...removed, ...added].reduce((n, u) => n + u.length, 0);
  return { removed, added, size };
}

export function formatDiff(d: Diff): string {
  return [...d.removed.map((u) => `- ${u}`), ...d.added.map((u) => `+ ${u}`)].join("\n");
}

/** Lowercases host, drops hash, tracking params and trailing slash. */
export function canonicalUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|ref$|source$|hs|_hs|mc_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
  }
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  let s = u.toString();
  if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
  return s;
}

/** True when every quote appears in the source, ignoring case, whitespace and quote style. */
export function quotesInSource(quotes: string[], source: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const src = norm(source);
  return quotes.length > 0 && quotes.every((q) => q.trim().length >= 12 && src.includes(norm(q)));
}
