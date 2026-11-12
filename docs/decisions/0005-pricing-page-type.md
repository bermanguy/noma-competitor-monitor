# 0005. Pricing pages get their own reading skill

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), on a decision card: "Build it, demo on a canary"

## Context

Watched pages are compared as normalised text, and a change must be at least 40 characters before the model looks at it. On a pricing page that rule is wrong: "$29" becoming "$34" is three characters and the most important change on the page. Guy asked for a page type that understands plans, monthly and yearly prices, and features.

None of the four competitors publishes a pricing page today.

## Decision

- A watched page has a type: `general` (default) or `pricing`. The owner picks it when adding the page.
- A pricing page is read into plans, prices per billing period, and features. The model reads it only when the page text changed, anchored on the previous reading.
- Code checks that every price is on the page. A reading that fails the check is not stored.
- Code compares plan by plan and reports a change only when the page text backs it up. No size threshold.
- The demo uses a pricing canary page we control, since no competitor has a pricing page.

## Why

- Price and packaging moves matter to Product and Marketing even when tiny, and a text diff hides them.
- Code, not the model, decides what changed, so a model misreading never becomes an alert.
- Page types keep the door open for other skills (for example a careers page) without changing the general path.

## Alternatives considered

- Lower the 40-character threshold for all pages: floods every page with noise.
- Leave pricing out of the MVP: safe, but loses a strong demo moment that Guy asked for.

## Consequences

- One more model call per changed pricing page (a cheaper model than the judge).
- Shown in the demo through the pricing canary. Details in [architecture](../architecture.md) under page types.
