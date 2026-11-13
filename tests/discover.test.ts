import { describe, expect, it } from "vitest";
import { classifyLinks, discoverSources, findPosts, siteLinks, titleFromUrl } from "../src/pipeline/discover";
import type { FetchResult } from "../src/pipeline/fetch";

const filler = "<p>" + "Secure every AI model and agent across the enterprise with one platform. ".repeat(4) + "</p>";
const nav = `<nav>
  <a href="/platform">Platform</a><a href="/solutions/ciso">For CISOs</a><a href="/solutions/red-teaming">Red Teaming</a>
  <a href="/services">Services</a><a href="/innovation-hub">Resources</a><a href="/newsroom">Newsroom</a>
  <a href="/research">Research</a><a href="/careers">Careers</a><a href="/book-a-demo">Book a demo</a>
  <a href="https://www.linkedin.com/company/x">LinkedIn</a></nav>`;
const page = (body: string) => `<html><head><title>t</title></head><body>${nav}<main>${body}${filler}</main></body></html>`;

// Modelled on hiddenlayer.com in November 2026: no feed, no /blog, articles listed away from the listing's own path.
const site: Record<string, string> = {
  "https://hiddenlayer.com/": page("<h1>Security for AI</h1>"),
  "https://www.hiddenlayer.com/platform": page("<h1>The platform</h1>"),
  "https://www.hiddenlayer.com/solutions/ciso": page("<h1>For CISOs</h1>"),
  "https://www.hiddenlayer.com/solutions/red-teaming": page("<h1>Red teaming</h1>"),
  "https://www.hiddenlayer.com/newsroom": page(`
    <a href="/news/hiddenlayer-unveils-agent-harness-security"><h3>HiddenLayer Unveils Agent Harness Security</h3></a>
    <a href="/news/hiddenlayer-servicenow-control-tower-alliance"><h3>ServiceNow AI Control Tower alliance</h3></a>
    <a href="/news/hiddenlayer-100m-series-b-ai-security"><h3>HiddenLayer raises $100M</h3></a>
    <a href="https://www.youtube.com/watch?v=1">Podcast</a>`),
  "https://www.hiddenlayer.com/innovation-hub": page(`
    <a href="/insight/ai-agent-skills-security"><h3>AI agent skills security</h3></a>
    <a href="/insight/how-hiddenlayer-secures-cursor"><h3>How HiddenLayer secures Cursor</h3></a>
    <a href="/insight/behind-the-build-hackathon"><h3>Behind the build</h3></a>
    <a href="/research/system-one-model-security"><h3>System one</h3></a>`),
  // The research page only repeats three news links: same articles as the newsroom, so it must not be added twice.
  "https://www.hiddenlayer.com/research": page(`
    <a href="/news/hiddenlayer-unveils-agent-harness-security">a</a>
    <a href="/news/hiddenlayer-servicenow-control-tower-alliance">b</a>
    <a href="/news/hiddenlayer-100m-series-b-ai-security">c</a>`),
};

const fetcher = async (url: string): Promise<FetchResult> => {
  const key = url.replace("https://hiddenlayer.com/", "https://www.hiddenlayer.com/").replace(/\/$/, "");
  const body = site[url] ?? site[key] ?? site[key + "/"];
  return body
    ? { ok: true, status: 200, url: url === "https://hiddenlayer.com/" ? "https://www.hiddenlayer.com/" : url, body, contentType: "text/html" }
    : { ok: false, status: 404, url, body: "", contentType: "text/html", error: "http 404" };
};

describe("discoverSources", () => {
  it("finds news, the resource hub, product pages and no pricing on a HiddenLayer-like site", async () => {
    const d = await discoverSources("hiddenlayer.com", fetcher);
    const by = (role: string) => d.sources.filter((s) => s.role === role);
    expect(by("homepage")).toHaveLength(1);
    const posts = by("posts");
    expect(posts.map((p) => p.linkPrefix).sort()).toEqual(["/insight", "/news"]);
    expect(posts.find((p) => p.linkPrefix === "/news")!.sample[0]).toBe("HiddenLayer Unveils Agent Harness Security");
    expect(by("product").map((p) => p.url)).toEqual([
      "https://www.hiddenlayer.com/platform",
      "https://www.hiddenlayer.com/solutions/ciso",
      "https://www.hiddenlayer.com/solutions/red-teaming",
    ]);
    expect(by("pricing")).toHaveLength(0);
    expect(d.notes.join(" ")).toMatch(/pricing/);
  });

  it("reports a site it can't open", async () => {
    const d = await discoverSources("nope.example", async (url) => ({ ok: false, status: 0, url, body: "", contentType: "", error: "ENOTFOUND" }));
    expect(d.sources).toHaveLength(0);
    expect(d.notes[0]).toMatch(/Could not open/);
  });
});

describe("findPosts", () => {
  it("keeps the listing's own path when articles live under it", () => {
    const html = `<a href="/blog/one-long-post-title">1</a><a href="/blog/two-long-post-title">2</a><a href="/blog/three-long-post-title">3</a>`;
    expect(findPosts(html, "https://x.com/blog")?.prefix).toBe("/blog");
  });
  it("skips a hub's own section links and finds the articles they point to", () => {
    const html = `<a href="/innovation-hub/insights">Insights</a><a href="/innovation-hub/research">Research</a><a href="/innovation-hub/case-study">Case Study</a>
      <a href="/insight/ai-agent-skills-security"></a><a href="/insight/how-hiddenlayer-secures-cursor"></a><a href="/insight/behind-the-build-hackathon"></a>`;
    const found = findPosts(html, "https://x.com/innovation-hub");
    expect(found?.prefix).toBe("/insight");
    expect(titleFromUrl(found!.links[0]!.url)).toBe("Ai agent skills security");
  });
  it("ignores a menu of short product links", () => {
    const html = `<a href="/solutions/ciso">a</a><a href="/solutions/red-teaming">b</a><a href="/solutions/soc">c</a>`;
    expect(findPosts(html, "https://x.com/newsroom")).toBeNull();
  });
});

describe("classifyLinks", () => {
  it("sorts menu links by role and skips careers and demo pages", () => {
    const c = classifyLinks(siteLinks(`<a href="/pricing">Pricing</a><a href="/blog">Blog</a><a href="/products/gateway">Gateway</a><a href="/careers">Jobs</a>`, "https://x.com/"));
    expect(c.pricing.map((l) => l.path)).toEqual(["/pricing"]);
    expect(c.posts.map((l) => l.path)).toEqual(["/blog"]);
    expect(c.product.map((l) => l.path)).toEqual(["/products/gateway"]);
  });
});
