# 0011. A "not useful" vote can become an exam item

- Status: Proposed, waiting for the product owner's review of the PR
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread: close the existing feedback loop, keep it small

## Context

Team members already vote useful or not useful, with a reason, from links in Slack. Until now a vote only reached the prompt as a recent example, and nobody saw the not-useful votes in one place. A mistake the judge made once could come back after the next prompt change, and the exam would not notice, because the exam only knows the hand-labelled files in `evals/golden/`.

## Decision

- Settings shows **To review**: every item a team marked not useful in the last 14 days, with the level the judge gave, its reason and the voter's reason.
- The owner picks the level each team should have got and clicks **Add to the exam**. The item is stored in the database (`golden_item`) in the same shape as a golden file, labelled by the owner.
- The exam run from `/ops` grades the golden files plus these items. The result lists them as "Added by the owner from team votes", with the owner's level and the judge's level per team. The downloaded report has the same list.
- A golden file for the same page wins, so an item is never graded twice. Adding an item again replaces the owner's answer.

## Why

- It turns a complaint into a test. Once added, every later exam checks that the judge no longer makes that mistake.
- The owner decides the right answer, not the voter: one person's "not useful" may be right for them and wrong for the team.
- It needs no new channel, schedule, user or screen: one list on the owner page and one table.

## Alternatives considered

- Write the items into `evals/golden/` files: versioned, but needs a commit and a deploy for each vote.
- A daily Slack question to each team owner, with an MCP server: more reach, but new users, scheduling and screens with three days left (decision 0010).

## Consequences

- The live exam and `npm run eval` can differ: the laptop run grades the files only. To make an owner item part of the versioned set, copy it into `evals/golden/`.
- An owner item is graded only from the next exam run; until then `/ops` says so.
