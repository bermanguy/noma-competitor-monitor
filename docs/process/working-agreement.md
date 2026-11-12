# Working agreement

## Roles

| Who | Owns | Does not do |
| --- | --- | --- |
| Guy (product owner) | Scope, priorities, what "good output" means for each team, the demo story, acceptance | Relay messages between tools; read diffs to approve routine engineering |
| Claude (architect, mentor, builder) | Architecture, implementation, tests, evals, docs, PRs, explaining every choice so Guy can defend it | Change scope, team lenses or anything user-facing without Guy's decision |

There is one AI in the loop. A second opinion comes from an independent review pass on the code itself (a fresh reviewer that sees only the diff), not from relaying summaries through another chat.

## One source of truth

- The repository is the record: `docs/` for the brief, architecture, decisions and research; `docs/decisions/` for each decision with its reason.
- The project thread is the conversation. Anything decided there is written into the repo the same day.
- No separate status file to keep in sync. Status lives in the PR list and the checklist in the thread.

## How decisions are made

- **Claude decides and records** anything reversible and technical (libraries, schema, code structure). Guy can overrule any of them later.
- **Guy decides** scope, team definitions, what counts as important, demo content, anything that costs money or can't be undone. Claude brings these as one question with a recommendation, and keeps working on the recommended option until Guy answers.
- Silence is not a blocker: if a decision card waits, work continues on the recommendation.

## Definition of done for any change

1. It moves a step in the demo script or a golden example forward. If it doesn't, it waits.
2. CI is green: typecheck, lint, unit tests, and the eval run when prompts or scoring change.
3. The PR states what was verified and how (test output, eval numbers, screenshot), and labels anything unverified.

## PRs without Guy as the bottleneck

- **Two kinds of PR**, set by label:
  - `engineering`: internal changes with no user-visible behaviour change. Merged by Claude once CI is green and the independent review pass has no blocking findings. Guy gets a daily summary, not a review request.
  - `needs-owner`: anything that changes what a team receives, prompt or lens text, business-facing UI copy, cost, or scope. Guy reviews the *behaviour* (eval diff, screenshot, sample Slack message), not the code.
- `main` is protected: CI must pass before any merge.
- Every merge deploys automatically to the live URL, so Guy reviews the product, not the diff.
- Guy's standing approval for Claude to merge `engineering` PRs is given once, in the thread, and can be withdrawn at any time.

## Rhythm until submission

- Morning: Claude posts the plan for the day against the demo script.
- Evening: Claude posts what is live, what the evals say, and the one or two decisions needed tomorrow.
- Sunday afternoon is reserved for the design doc and the video.
