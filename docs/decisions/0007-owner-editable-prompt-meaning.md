# 0007. The owner edits what Noma sells, the levels, and the topics in the app

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), on a decision card: "1+2 now, 3 tonight"

## Context

The judgment depends on business meaning: what Noma sells, what each level (alert, digest, log, none) means, the topics, and the team briefs. Guy was worried this goes stale when Noma's site changes, because only the team briefs and topics were stored where he could edit them, and levels lived in repo files.

## Decision

1. **Company profile now.** A short profile of what Noma sells (products, solutions, environments) is part of every judgment prompt.
2. **Everything editable now.** The company profile, the level definitions, the pricing guidance, the topics and the team briefs are edited in the app (Settings). The repo files are the starting defaults.
3. **Suggestions tonight.** The system watches Noma's own platform page and, when it changes, drafts an updated profile and topic suggestions for the owner to approve. Nothing changes without approval.

Related setting: the daily digest goes out with the first run from 08:00 Israel time (`DIGEST_HOUR_LOCAL`, `APP_TIMEZONE`): 08:00 in winter, 09:00 in summer. The owner preferred a plain 3-hour schedule over an hourly wake-up that would hold 09:00 exactly. It is a setting, not a separate decision.

## Why

- The owner can fix meaning without a developer or a deploy.
- Suggestions keep the profile current without letting a website change rewrite the prompt silently.

## Alternatives considered

- Keep meaning in repo files: versioned, but every edit needs a PR and a deploy.
- Rewrite the profile automatically from Noma's site: current, but unreviewed text would steer every judgment.

## Consequences

- The prompt version changes, and the golden set is re-run against it.
- Owner edits apply from the next run; past judgments keep the version they were made with.
