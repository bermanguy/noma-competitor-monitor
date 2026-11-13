# 0016. Adding a competitor is a three-step wizard, and discovery reads the site's menu

- Status: Accepted by the product owner, 2026-11-13
- Date: 2026-11-13
- Decided by: Guy (product owner), in the project thread: "I want a full wizard and a polished, intuitive experience"

## Context

Adding HiddenLayer watched only its homepage. Discovery guessed a fixed list of addresses (`/blog`, `/news`, …), kept at most one blog or news page, and required articles to sit under the listing's own path. HiddenLayer's blog is at `/innovation-hub` (its articles are under `/insight/…`), and its `/newsroom` lists articles under `/news/…`, so nothing matched. Discovery never looked for product or pricing pages, although we had said it did.

## Decision

- Discovery (`discoverSources` in `src/pipeline/discover.ts`) reads the homepage menu and sorts links into blog/news, product and pricing pages. It still tries the common addresses, finds where a listing's articles actually live (the largest group of article-like links), keeps up to three blog/news sources, and keeps only pages that open and have text. It writes nothing. Every result has a role and a suggested on/off.
- Settings › Competitors opens a three-step wizard: website → pages to watch (checkboxes, a type per page, latest post titles as proof, add a page we missed) → first check (each page is read now, with a live status per page).
- The wizard and the Claude connector share discovery, and `createCompetitor` from `src/lib/competitors.ts` does the inserts.
- The first check uses a finished run row, so it can't block the scheduled run.

## How other tools do it

Kompyte suggests a competitor's main pages (home, pricing) and labels them by type ([help](https://helpcenter.kompyte.pro/en/articles/87668-how-to-customize-your-web-tracking)). Visualping previews the page before saving and says that alerts start only after a check ([help](https://help.visualping.io/en/articles/6079545-getting-started)). The wizard combines both ideas: pages are found automatically, and the person decides which ones to watch.
