# 0014. The Changes page is a compact list, and levels are named by how much a change matters

- Status: Proposed, waiting for the product owner's review of the PR
- Date: 2026-11-13
- Decided by: Guy (product owner), in the project thread, from mockups

## Context

The Changes page showed every change as a full card: every team's read, every quote and every chip, all at once. It was hard to scan. There was no count of results, no logo, and no filter by company, date or topic. Each level was labelled by how it was delivered ("Sent now", "In daily digest", "Recorded, not sent"), which reads oddly on a page that lists changes, not notifications.

## Decision

- **Compact list.** Each change takes one row: company logo, company and type, title, one-line summary, topic, level and date. Rows are grouped by Today, This week and Earlier. Clicking a row opens it in place, with each team's read, quotes and Slack delivery.
- **Level names say how much a change matters,** in the words of the level definitions:

  | Level | Shown as | Meaning |
  |---|---|---|
  | alert | Urgent | see it today |
  | digest | Worth knowing | this week |
  | log | FYI | loosely related |

  The judge, the exam, Slack and the code keep alert, digest and log.
- **Delivery is a fact inside an opened row,** for example "Sent to Slack as an alert, Nov 12, 12:26" or "Not sent: a quote was not found in the source", taken from what was actually posted.
- **Level tabs are the counter.** "All · Urgent · Worth knowing · FYI" show counts and filter by level. Company and Date are always shown. Topic, and changes that were not judged, sit under "+ Filter".
- **All teams** replaces the topic column with one level column per team.

## Why

- A row you can scan answers the first question, which is "what happened, and does it matter to me". The reasoning stays one click away.
- Competitor-intelligence tools sell curation over raw feeds, and change monitors show a short summary with an importance tag, with detail on demand. Clean list tools such as Linear keep headers and filters minimal.
- Naming levels by importance keeps one meaning per word. "Digest" is how something was delivered, not how much it matters.

## Alternatives considered

- **Slim cards.** These are lighter than today's page, but still about a third as dense as a list.
- **List with a side panel.** This is fast on a wide screen, but cramped on a laptop and unusable on a phone.
- **Keep alert, digest and log as the labels, with a legend.** This keeps one vocabulary, but the page would talk about delivery instead of importance.

## Consequences

- Logos load from each company's own site (`/favicon.ico`) in the viewer's browser, with a letter tile when there is none.
- Slack messages and Setup still use alert, digest and log for now.
