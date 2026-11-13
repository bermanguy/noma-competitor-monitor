# 0015. The MVP rolls out to the owners and a few business users first

- Status: Accepted by the product owner, 2026-11-13
- Decided by: Guy (product owner)

## Decision

What we submit and demo is an MVP. It runs first with the area owners (Marketing, Product, R&D) and a few business users per team. The first goal is validation: are the updates accurate, does each team get the right level, and what is missing? Their votes become exam items ([0011](0011-votes-become-exam-items.md)), and we tune accuracy with them before widening to the full teams.

Only after that do we add sources, starting with the ones that matter most to R&D: release notes, changelogs, docs and technical channels.

## Why

- Trust comes before reach ([0010](0010-trust-before-experience.md)). A noisy first week with a whole team would get the channel muted; a few engaged users give fast, honest feedback.
- The answer key starts as our own judgment. Real users replacing it is the fastest way to make it right.
- Adding sources before the judgment is validated would multiply any error.

## Consequences

- No changes to the code: teams, channels and the feedback loop already support a small first audience.
- "What's next" in the design doc starts with this rollout, then more sources.
