# 0006. The first check judges the latest three posts

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), before the first live run

## Context

On the first crawl of a blog or newsroom, every post is unseen. Treating all of them as new would flood the teams with old posts. Treating none as new would make the first run silent, and the demo would show nothing real.

## Decision

- On a source's first crawl, the latest `BACKFILL_POSTS` (default 3) posts are judged. The rest are stored as history without a judgment.
- Backfilled items are labelled "published before monitoring started".
- They go to the digest only, never as alerts, and quiet teams don't get them.
- Watched pages are always baselined silently on their first check.

## Why

- Shows real judgments on real competitor content from day one, at a small cost (about 21 posts).
- The label and digest-only rule stop old news from looking urgent.

## Alternatives considered

- Judge nothing on the first run: correct, but nothing to show until competitors publish.
- Judge everything: costly and floods the channels with old news.

## Consequences

- The first digest per team contains these backfilled items.
- Changing the number later only affects sources that have not been crawled yet.
