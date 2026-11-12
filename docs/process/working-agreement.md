# Working agreement

## Roles

| Who | Owns | Does not do |
| --- | --- | --- |
| Guy (product owner) | Scope, priorities, what "good output" means for each team, the demo story, acceptance, and the business meaning in prompts (see below) | Relay messages between tools; read diffs to approve routine engineering |
| Claude (architect, mentor, builder) | Architecture, implementation, tests, evals, docs, PRs, explaining every choice so Guy can defend it | Change scope, team lenses or anything user-facing without Guy's decision |

There is one AI in the loop. A second opinion comes from an independent review pass on the code itself (a fresh reviewer that sees only the diff), not from relaying summaries through another chat.

## One source of truth

- [`docs/scope.md`](../scope.md) is the frozen MVP scope. Neither of us works outside it until Guy changes it there.
- [`docs/demo-script.md`](../demo-script.md) is the five-minute demo, step by step. Every plan and every PR points at a step in it.
- The repository is the record: `docs/` for the brief, architecture, decisions and research; `docs/decisions/` for each decision with its reason.
- The project thread is the conversation. Anything decided there is written into the repo the same day.
- No separate status file to keep in sync. Status lives in the PR list and the checklist in the thread.

## How decisions are made

- **Claude decides and records** reversible, low-impact technical details (libraries, schema, code structure). Guy can overrule any of them later.
- **Guy confirms quickly** the technical choices that shape the demo or the output-quality story, even when reversible. The list is fixed: the change-detection approach, how much is filtered before the LLM, the delivery mechanism, and the scoring rubric structure.
- **Guy decides** scope, demo content, anything that costs money or can't be undone.
- **Guy owns the business meaning in prompts**: team definitions and lenses, topic descriptions, and the definition of each relevance level. These live in their own files, separate from the rest of the prompt. Claude owns the scaffolding around them (output format, evidence rules, injection defences), and every change to it is scored against the golden set before merge.
- Every owner decision comes as one card: the **recommendation**, **why**, **what happens if we do nothing**, and the **impact on the demo**. Claude keeps working on the recommendation until Guy answers.

## Where each kind of change is written down

- **Decision log** (`docs/decisions/`): a choice with a real alternative that someone will question later, or any choice Guy made on a decision card. One file each: context, decision, why, consequences.
- **Scope change log** (`docs/scope.md`): anything that moves a feature in or out of the MVP.
- **Architecture** (`docs/architecture.md`): how the system works now. Updated in the same PR as the code.
- **PR description only**: settings, defaults and fixes (a schedule hour, a threshold, a bug). They are visible in the code and the PR history, and are easy to change.
- When a setting is part of a logged decision, it gets one line in that decision instead of its own file.

## Definition of done for any change

1. It moves a step in [the demo script](../demo-script.md) or a golden example forward. If it doesn't, it waits.
2. CI is green: typecheck, lint, unit tests, and the eval run when prompts or scoring change.
3. The PR states what was verified and how (test output, eval numbers, screenshot), and labels anything unverified.

## PRs without Guy as the bottleneck

- **Two kinds of PR**, set by label:
  - `engineering`: internal changes with no user-visible behaviour change. Merged by Claude once CI is green and the independent review pass has no blocking findings. Guy gets a daily summary, not a review request.
  - `needs-owner`: anything that changes what a team receives, team lenses, topics or level definitions, any of the four confirm-first choices, business-facing UI copy, cost, or scope. Guy reviews the *behaviour* (eval diff, screenshot, sample Slack message), not the code.
- `main` is protected: CI must pass before any merge.
- Every merge deploys automatically to the live URL, so Guy reviews the product, not the diff.
- Guy's standing approval for Claude to merge `engineering` PRs is given once, in the thread, and can be withdrawn at any time.

## Rhythm until submission

- Morning: Claude posts the plan for the day as demo-script steps.
- Evening: Claude posts what is live, what the evals say, and the one or two decisions needed tomorrow.
- Submission is Sunday 10:00 (Asia/Jerusalem); the presentation is Sunday 14:00.
- Code freeze Saturday evening. The design doc is written Saturday night or Sunday morning, as a summary of `architecture.md`, `scope.md` and the decision records, which every PR keeps current.
- Before submitting, a final check: every decision record and every section of `architecture.md` appears in the design doc, and every claim in it matches the code.
