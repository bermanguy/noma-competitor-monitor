import { describe, expect, it } from "vitest";
import { extractListingLinks, extractMain, feedLinks } from "../src/pipeline/extract";
import { looksBlocked } from "../src/pipeline/fetch";

const listing = `<html><head><link rel="alternate" type="application/rss+xml" href="/blog/rss.xml"></head><body>
<nav><a href="/blog">Blog</a><a href="/blog/category/news">News</a></nav>
<a href="/blog/launching-guardian-agents?utm_source=x">Launching Guardian Agents</a>
<a href="https://www.zenity.io/blog/launching-guardian-agents/">Read more</a>
<a href="/blog/page/2">Next</a><a href="https://other.com/blog/x">External</a>
<a href="/blog/mcp-attacks">MCP attacks in the wild</a></body></html>`;

describe("extractListingLinks", () => {
  it("drops button text like Read as a title, keeping the card's real heading", () => {
    const html = `<a href="/blog/vanta-to-acquire-pillar"><h3>Vanta to Acquire Pillar</h3></a><a href="/blog/vanta-to-acquire-pillar">Read</a><a href="/blog/other-post-here">Read more →</a>`;
    const links = extractListingLinks(html, "https://pillar.test/blog", "/blog");
    expect(links.find((l) => l.url.endsWith("pillar"))?.title).toBe("Vanta to Acquire Pillar");
    expect(links.find((l) => l.url.endsWith("here"))?.title).toBeNull();
  });

  it("finds article links under the prefix, deduped, without category, pagination or external links", () => {
    const links = extractListingLinks(listing, "https://zenity.io/blog", "/blog");
    expect(links.map((l) => l.url).sort()).toEqual(["https://zenity.io/blog/launching-guardian-agents", "https://zenity.io/blog/mcp-attacks"]);
    expect(links.find((l) => l.url.endsWith("guardian-agents"))?.title).toBe("Launching Guardian Agents");
  });
  it("finds advertised feeds", () => {
    expect(feedLinks(listing, "https://zenity.io/blog")).toEqual(["https://zenity.io/blog/rss.xml"]);
  });
});

describe("titles", () => {
  it("takes a card link's heading, not its category, date and teaser run together", () => {
    const html = `<a href="/blog/detection-results"><span>Blog</span><span>November 9, 2026</span><h3>Runtime Security for AI Agents: Detection Results</h3><p>AI agent runtime security, measured.</p></a>`;
    expect(extractListingLinks(html, "https://straiker.ai/blog", "/blog")[0]?.title).toBe("Runtime Security for AI Agents: Detection Results");
  });
  it("prefers the page's share title for a post", () => {
    const html = `<html><head><title>Blog | Straiker</title><meta property="og:title" content="Runtime Security for AI Agents: Detection Results"></head>
      <body><article>${"<p>Straiker published detection results for AI agents at runtime, with latency.</p>".repeat(5)}</article></body></html>`;
    expect(extractMain(html, "https://straiker.ai/blog/x").title).toBe("Runtime Security for AI Agents: Detection Results");
  });
});

describe("extractMain", () => {
  it("keeps the article text and the stated publication date, drops navigation", () => {
    const html = `<html><head><title>Post</title><meta property="article:published_time" content="2026-11-10T09:00:00Z"></head>
      <body><nav>Home Pricing Login</nav><article><h1>Guardian Agents</h1>${"<p>Zenity announced Guardian Agents for Copilot Studio, which inspect agent actions at runtime.</p>".repeat(5)}</article><footer>© 2026</footer></body></html>`;
    const ex = extractMain(html, "https://zenity.io/blog/x");
    expect(ex.text).toContain("Zenity announced Guardian Agents");
    expect(ex.text).not.toContain("Login");
    expect(ex.publishedAt?.toISOString()).toBe("2026-11-10T09:00:00.000Z");
  });
});

describe("looksBlocked", () => {
  it("treats refusals and bot walls as failures", () => {
    expect(looksBlocked(403, "")).toMatch(/blocked/);
    expect(looksBlocked(200, "<title>Just a moment...</title>")).toBe("bot wall");
    expect(looksBlocked(200, "<p>normal page</p>")).toBeNull();
  });
});

describe("looksLikeCardText", () => {
  it("spots a listing card's glued text and leaves real titles alone", async () => {
    const { looksLikeCardText } = await import("../src/pipeline/repair-titles");
    expect(looksLikeCardText("BlogNovember 9, 2026Runtime Security for AI Applications and AI Agents: Straiker’s Detection Results")).toBe(true);
    expect(looksLikeCardText("BlogOctober 13, 2026Straiker Named in Two 2026 Gartner® Hype Cycle™ Reports")).toBe(true);
    expect(looksLikeCardText("Straiker EU & India Expansion | Regional AWS Hosting")).toBe(false);
    expect(looksLikeCardText("Blogging about November launches")).toBe(false);
    expect(looksLikeCardText(null)).toBe(false);
  });
});
