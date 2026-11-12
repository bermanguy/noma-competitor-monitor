# 0009. A bad quote gets one retry, and the exam checks same-story links

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread after exam round 3

## Context

- Round 3 of the exam showed a severe miss for Marketing. The judge picked the right level (alert), but one of its quotes was not in the source word for word. Under "no quote, no send", the alert was dropped without anyone seeing it.
- The answer key for the AgentCorruption press release said `log` for every team. The judge found something the Labs post did not have (AWS made IMDSv2 the default for AgentCore), which R&D can use. The exam also graded only the level, so a judge that sent the release without linking it to the Labs post would have passed.

## Decision

- **Evidence.** After the judge answers, quotes that are not in the source are dropped. If a sent judgment (alert or digest) still has at least one exact quote, it goes out with that quote. If it has none, the judge is asked once, in a short separate call, to copy exact phrases that support the reason it already gave. If that also fails, the judgment is held, as before, and counted on /ops under "held back because a quote was not in the source".
- **Answer key.** The press release is now `digest` for R&D and `log` for Marketing and Product.
- **Story links.** A golden item can name the earlier item it repeats (`expectedSameStoryAs`). The exam reports how many of these links the judge got right, apart from the per-team scores. In Slack, a linked item shows only what is new, with a link to the original (see 0008).

## Why

- The quote rule protects the teams from claims the model invented. The retry keeps that rule and only stops correct decisions from being lost to a copying mistake.
- The retry asks for quotes only, not a new decision, so it cannot change the level.
- A follow-up is useful only if the team can see what it follows. Grading the link makes that part of the exam.

## Alternatives considered

- Fuzzy quote matching: it would let near-paraphrases through, which is the thing the rule exists to stop.
- Counting a wrong link as a wrong level for every team: it mixes two different errors into one number. A separate line is easier to read.

## Consequences

- The prompt version is now judge-v5. Some items cost one extra small call.
- Exam results from before this change have no story line. The baseline should be saved after this change.
