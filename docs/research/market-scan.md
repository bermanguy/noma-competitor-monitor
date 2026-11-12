# Market scan: existing competitor-monitoring products

As of 2026-11-12. Purpose: learn what is already solved and how, so we copy proven patterns and spend our time only where the assignment is different.

## Summary

The market splits into three layers, and no single product covers what the assignment asks for:

1. **Change detectors** (Visualping, changedetection.io, Firecrawl) are good at "did this page change" and have converged on the same noise fixes. None decides importance *per team*.
2. **Feed and topic readers** (Feedly AI Feeds) are good at "is this article about my topic" and let users train relevance with a downvote.
3. **Competitive-intelligence platforms** (Crayon, Klue, Kompyte) score importance, tag and route to sales. They are built around sales enablement and battlecards, not Marketing / Product / R&D lenses, and they are heavy, expensive platforms.

Our gap to fill is the join: layer-1 detection plus layer-2 style plain-language relevance, applied **per team**, with evidence and a feedback loop.

## What each product teaches us

| Product | What it does | Pattern worth copying | What it doesn't solve for us |
| --- | --- | --- | --- |
| [Visualping](https://visualping.io/blog/how-visualping-cuts-false-positives) | Page change monitoring with AI summaries and an "Important" flag | Plain-language importance prompt per monitor ("only flag pricing or availability changes", plus an "Ignore..." clause); label unimportant changes instead of hiding them; thumbs-down tunes future calls ([analyzer](https://visualping.io/blog/analyzer-explained)); bot-wall pages are treated as failed checks, not changes | One importance verdict per monitor, not per audience; no feed/blog discovery |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) (open source) | Self-hosted change detection | Per-site choice between fast fetcher and real Chrome; ignore-text and selector filters; "AI rules" in plain English to suppress irrelevant diffs; Slack and other channels via one notification library | Operator tool, not a business-user tool; no relevance per team |
| [Firecrawl change tracking](https://docs.firecrawl.dev/features/change-tracking) | Scrape API with diffs | Compare clean **markdown**, not HTML; ignore whitespace and ordering; statuses `new / same / changed / removed`; a `visibility` flag for pages that drop off a listing; warns that comparisons break if extraction settings change between runs | A primitive: scheduling, judgment and routing are left to you. A paid dependency |
| [Feedly AI Feeds](https://docs.feedly.com/article/549-refining-feedly-ai-feeds) | Topic-trained news feeds | "Less like this" downvote that asks *why*, then removes similar items; title-only matching to drop passing mentions | Articles only, not quiet page changes; one reader's relevance, not three teams |
| [Crayon](https://crayon.co/product/crayon-ai) | CI platform for sales enablement | ML importance score per insight; automatic tagging into 80+ subcategories; anomaly alerts; answers delivered in Slack/Teams | Built around sales battlecards and internal sources (Gong, CRM); far beyond our scope |
| Klue, Kompyte | CI platforms, similar to Crayon | Curation step before sharing; battlecards kept fresh | Same as Crayon |

## Numbers worth quoting

- Visualping reports that its AI classifies **83% of detected changes as not important**, across about 1.8 million active monitors sampled in April 2026 ([source](https://visualping.io/blog/how-visualping-cuts-false-positives)). That is the scale of the noise problem: most raw changes should never reach a person.
- The same post says pure screenshot diffs produced too many false positives and users moved to text-based modes, and that JavaScript-heavy single-page apps, bot walls and personalised pages remain unsolved noise sources.

## What this changes in our plan

1. **Diff extracted text, never HTML or screenshots.** Everyone converged here. Keep extraction settings fixed per source, since changing them creates fake diffs (Firecrawl's warning).
2. **Two gates for page changes, as Visualping does:** a cheap deterministic filter (main content only, normalise dates and numbers, minimum change size), then a small-model "meaningful or cosmetic?" call with a quoted reason.
3. **Importance is a plain-language prompt the business writes.** Visualping and changedetection.io both let users describe what matters in English. We do the same, per team: the team lens *is* the configuration.
4. **Label, don't hide.** Low-relevance items stay visible in the web feed with their reason, so nobody wonders whether the system missed something.
5. **Feedback asks why.** Copy Feedly's downvote-with-reason. The reason text is what makes the next prompt better.
6. **Treat bot walls and empty pages as failures, not changes.** This is our "silent breakage" protection.
7. **Build vs buy for fetching is an open question for the spike.** Firecrawl would handle JS rendering, main-content extraction and diffs as a service. Our own Playwright + Readability fetcher is free and fully under our control. Decide after trying both on the real competitor sites (see the decision log).

## What we deliberately don't copy

- CI-platform scope: battlecards, CRM and call-recording ingestion, win/loss. Not asked for.
- Screenshot / visual diffing. The industry moved away from it.
- A single importance score. The brief rules it out, and every product that has one serves one audience.

## Limits of this scan

Vendor pages describe what vendors claim, not measured quality. User-review sites (G2, Capterra) were not sampled systematically here; the previous attempt's review findings were not verified and are not reused.
