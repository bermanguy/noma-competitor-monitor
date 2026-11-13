# 0017: Judge each team in its own call

**Status:** accepted, 13 Nov 2026

## Context

The judge returned every team's level from one call, with all three team descriptions in the prompt. When an owner edited their team's description, the check before it went live re-judged all teams, and it held Maya's Marketing edit back because two R&D answers moved. Those moves were the judge's own variance: about 1 answer in 30 lands a level apart between runs on an unchanged prompt, and the current models no longer accept a temperature setting. With all descriptions in one prompt, we also couldn't prove an edit never leaks into another team's answer.

## Decision

- One judge call per team per item. Each call sees the item, the company profile, the levels, the topics, earlier items and **only its own team's description**.
- The shared part goes first and is cached, so the second and third calls read it at a tenth of the input price. Summary and same-story linking come from the first team's call.
- The owner's check re-judges only the edited team. Other teams' answers are carried over from the baseline unchanged: by construction, the edit can't touch them.
- "Try my edit" also judges only that team, current wording and draft side by side.
- Prompt version is now `judge-v6`. A check against an older baseline judges the current wording too, so the only difference it measures is the edit.

## Consequences

- "Product can't affect Marketing" holds by design, not by tolerance.
- Judging costs about a third more (three outputs instead of one longer one, plus cache writes). The edit check costs a third of what it did.
- The evals need one fresh run and a new baseline after this change.

## Considered

- **Keep one call, check only the edited team.** Cheaper, but the guarantee would rest on a tolerance for noise, not on design.
- **Lower the temperature.** Not accepted by the current models.
