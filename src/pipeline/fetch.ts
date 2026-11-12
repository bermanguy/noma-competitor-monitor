import { config } from "../config";
import type { FetchMode } from "../db/schema";
import { assertPublicUrl } from "./urlguard";

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  contentType: string;
  error?: string;
}

const BOT_WALL = [
  /just a moment\.\.\./i,
  /cf-challenge|challenge-platform/i,
  /attention required!? \| cloudflare/i,
  /verify you are (a )?human/i,
  /captcha/i,
  /access denied/i,
];

/** A page that loads but is a bot wall or an error page must be a failure, never a "change". */
export function looksBlocked(status: number, body: string): string | null {
  if (status === 401 || status === 403 || status === 407 || status === 451) return `blocked (${status})`;
  if (status === 429) return "rate limited (429)";
  if (status >= 400) return `http ${status}`;
  const head = body.slice(0, 20000);
  if (body.length < 50_000 && BOT_WALL.some((r) => r.test(head))) return "bot wall";
  return null;
}

async function fetchHttp(url: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": config.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const body = await res.text();
    const blocked = looksBlocked(res.status, body);
    return {
      ok: !blocked,
      status: res.status,
      url: res.url || url,
      body,
      contentType: res.headers.get("content-type") ?? "",
      error: blocked ?? undefined,
    };
  } finally {
    clearTimeout(t);
  }
}

async function fetchBrowser(url: string): Promise<FetchResult> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: config.browserExecutable,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ userAgent: config.userAgent });
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: config.fetchTimeoutMs * 2 });
    const body = await page.content();
    const status = res?.status() ?? 0;
    const blocked = looksBlocked(status, body);
    return { ok: !blocked, status, url: page.url(), body, contentType: "text/html", error: blocked ?? undefined };
  } finally {
    await browser.close();
  }
}

/** Fetch with one retry on network errors and 5xx. Never retries a refusal (401/403). */
export async function fetchSource(url: string, mode: FetchMode): Promise<FetchResult> {
  await assertPublicUrl(url);
  let last: FetchResult | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      last = mode === "browser" ? await fetchBrowser(url) : await fetchHttp(url);
      if (last.ok || last.status < 500) return last;
    } catch (e) {
      const err = e as Error & { cause?: { message?: string; code?: string } };
      const detail = err.cause?.code ?? err.cause?.message;
      last = { ok: false, status: 0, url, body: "", contentType: "", error: detail ? `${err.message}: ${detail}` : err.message };
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return last!;
}
