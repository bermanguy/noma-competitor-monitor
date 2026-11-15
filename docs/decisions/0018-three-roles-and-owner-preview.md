# 0018. Three roles (Builder, Owner, Member), owners manage their own team, and owners preview the next digest

- Status: Proposed, waiting for the product owner's review of the PR
- Date: 2026-11-13
- Decided by: Guy (product owner), in the project thread

## Context

"View as" had the Builder and one owner per team. Business teams used Slack only and had no view of their own. Owners could edit their team's description but could not see what that would change before saving, and adding a person meant asking the Builder.

## Decision

- **Three roles.** The **Builder** sees everything. An **Owner** belongs to one team (Marketing, Product or R&D) and sees everything but Builder; they edit only their own team. A **Member** belongs to one team and sees only Changes. "Member" was picked over "Viewer" or "Reader" because it names a person on a team, not a permission.
- **Members see their team only.** The Changes page shows their team's level and message, with no team switch, and a note that Slack is where updates arrive. They can rate an item there, the same as from Slack. Setup and Builder are hidden and redirect to Changes.
- **Owners manage people in their own team.** Setup / People lists each team. An owner adds or removes owners and members in their team; the Builder can do it for any team. Nobody removes themselves. Everyone added appears in "View as" right away.
- **Preview next digest.** Setup / Preview next digest shows the team's next Slack digest, built by the same code that sends it. With nothing waiting, it shows the last digest. "Try my edit" re-judges the team's latest 5 changes with a draft description and shows the level before and after. Nothing is saved until the owner presses Save.
- Three members to start: Lior (Marketing), Tamar (Product), Omer (R&D).

## Why

- Owners can run their team without the Builder: add people, and see the effect of a change before it reaches Slack.
- Members get one place to catch up, while Slack stays their main channel.

## Alternatives considered

- **Real sign-in and invites.** "View as" already shows the roles; sign-in adds risk and no demo value.
- **Owners create new teams.** Three fixed teams are enough for now.
- **Locking shared settings (competitors, topics, what Noma sells) per team.** They belong to everyone; Marketing must be able to add a competitor.

## Consequences

- People live in a new `person` table. The Builder stays fixed in code. Removing someone keeps the row (`removed_at`), so it can be traced.
- "Try my edit" makes up to 5 judge calls per press, counted in the monthly model budget.
- The owners' Slack ping for a "not useful" vote names the team's first owner from People.
