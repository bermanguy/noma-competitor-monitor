import { describe, expect, it } from "vitest";
import { canonicalUrl, diffText, normalizeText, quotesInSource } from "../src/pipeline/text";

describe("normalizeText", () => {
  it("ignores dates, times, relative times and copyright years", () => {
    const a = normalizeText("Posted March 3, 2026 at 10:15 am\n© 2025 Acme\nUpdated 3 days ago");
    const b = normalizeText("Posted April 9, 2026 at 4:02 pm\n© 2026 Acme\nUpdated 5 days ago");
    expect(a).toBe(b);
  });
  it("keeps prices and other numbers, because they can be the change", () => {
    expect(normalizeText("Pro plan $49 / month")).not.toBe(normalizeText("Pro plan $59 / month"));
  });
});

describe("diffText", () => {
  it("treats reordering as no change", () => {
    expect(diffText("a line\nb line", "b line\na line").size).toBe(0);
  });
  it("reports added and removed lines", () => {
    const d = diffText("The AI security platform\nFor enterprises", "The agentic security platform\nFor enterprises");
    expect(d.removed).toEqual(["The AI security platform"]);
    expect(d.added).toEqual(["The agentic security platform"]);
  });
});

describe("canonicalUrl", () => {
  it("drops tracking params, hash, www and trailing slash", () => {
    expect(canonicalUrl("https://WWW.Example.com/blog/post/?utm_source=x#top")).toBe("https://example.com/blog/post");
  });
  it("rejects non-http links", () => {
    expect(canonicalUrl("mailto:a@b.c")).toBeNull();
  });
});

describe("quotesInSource", () => {
  const src = "Zenity today announced “Guardian Agents”, a new capability for Copilot Studio.";
  it("accepts quotes that appear, ignoring quote style and case", () => {
    expect(quotesInSource(['announced "Guardian Agents", a new capability'], src)).toBe(true);
  });
  it("rejects invented quotes", () => {
    expect(quotesInSource(["Zenity acquired a startup"], src)).toBe(false);
  });
  it("rejects empty or very short evidence", () => {
    expect(quotesInSource([], src)).toBe(false);
    expect(quotesInSource(["Zenity"], src)).toBe(false);
  });
});
