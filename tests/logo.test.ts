import { describe, expect, it } from "vitest";
import { logoCandidates } from "../src/pipeline/logo";

describe("logoCandidates", () => {
  it("prefers the touch icon, then larger declared icons, then favicon.ico and Google's service", () => {
    const html = `<head><link rel="icon" href="/f-16.png" sizes="16x16"><link rel="icon" href="/f-64.png" sizes="64x64">
      <link rel="apple-touch-icon" href="/touch.png"><link rel="stylesheet" href="/x.css"></head>`;
    expect(logoCandidates(html, "https://www.example.com/")).toEqual([
      "https://www.example.com/touch.png",
      "https://www.example.com/f-64.png",
      "https://www.example.com/f-16.png",
      "https://www.example.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain=example.com&sz=128",
    ]);
  });
});
