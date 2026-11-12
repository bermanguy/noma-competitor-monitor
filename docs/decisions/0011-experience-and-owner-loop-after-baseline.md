# 0011. After the baseline: the owner experience and an improvement loop in Slack

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread
- Revises: 0010

## Context

Decision 0010 put trust ahead of experience until submission. That work reached a stopping point: three calibration rounds, quotes that no longer drop correct alerts, same-story links graded in the exam, and a baseline to lock. What is left is the experience. The owner screens work but read as an admin tool, and the improvement loop depends on an owner remembering to open /ops.

## Decision

Once the baseline is locked, effort moves to two things, built in parallel:

- **Improvement loop in Slack.**
  - Each team owner gets a short scheduled message: a few judgments the system was least sure of, or that the exam disagreed on.
  - Each item links to a one-question card. The owner's answer becomes a golden label or feedback.
  - The exam then runs on its own and shows the result before and after.
  - When answers point to a pattern, the system proposes new wording for the team description, and the owner approves it.
  - The same actions (run the exam, list disagreements, edit a description) are offered as an MCP server, so an owner can work with the system from Claude.
- **Owner experience.** The owner surface becomes a task-first inbox: what is waiting for me, how my team is doing, and editing a description with its effect on the exam.

Trust stays the floor: every change is checked against the baseline, and a regression blocks the change.

## Why

- The brief asks for a loop that improves from team feedback. A loop that waits for someone to visit a page rarely runs. A short question in Slack is answered in a minute.
- The baseline makes it safe to change prompts and screens quickly, because a regression shows up right away.

## Alternatives considered

- **Slack interactive buttons:** they need a Slack app with an interactivity endpoint. Links to a web card give the same answer with the webhooks we already have.
- **Per-owner accounts with SSO:** out of scope. A personal link per owner is enough for the demo.

## Consequences

- The scope line "UI polish beyond clear" and the deferred list in 0010 are partly undone, in this order: the auto-run exam, the owner card, then the redesign.
