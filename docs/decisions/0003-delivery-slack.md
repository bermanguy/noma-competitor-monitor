# 0003. Delivery through Slack, with a minimal web feed

- Status: Accepted, 2026-11-12 (owner)

## Decision

Teams receive updates in Slack: one channel per team, an immediate post for `alert` items and a daily digest for `digest` items. A minimal web feed lists every item with its reason, and is where feedback links land. Operator alerts go to a separate #ops channel.

## Why

- Slack is where the teams already are; a new tool nobody opens fails the brief.
- The brief requires web surfaces for configuration and operations anyway, so the feed costs little and answers "did the system see X?".
- Incoming webhooks need one secret per channel and no Slack app review.

## Left out

Trends, capability comparisons and dashboards (scope trap), email digests, interactive Slack buttons (needs a Slack app and a public interaction endpoint).
