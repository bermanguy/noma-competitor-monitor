# 0012. Navigation moves to a left rail with menus by role, and every page is named by its menu item

- Status: Proposed, waiting for the product owner's review of the PR
- Date: 2026-11-12
- Decided by: Guy (product owner), in the project thread, from mockups

## Context

The site had two tabs across the top ("What we found", "Competitors and topics"), a "Builder area" link only the builder saw, and a purple "View as" bar above everything. "Competitors and topics" had grown into one long page: votes to review, exam answers, competitors, topics, three prompts, team descriptions and site suggestions. The builder area was the same. An owner had to scroll to find the one thing they came to change, and nothing told them where they were.

## Decision

- **A left rail** with icons and labels, in Noma's colours (the radar logo's ink and cyan): **Changes**, **Setup**, and **Builder** for the builder only. The user sits at the bottom.
- **Sub-menus** for Setup and Builder. Setup has three groups: To review; What we watch (Competitors, Topics); and Prompts (What Noma sells, What the levels mean, What matters on pricing, What each team cares about, Suggested from our site). Builder has three groups: Runs, Sources, Not sent; Exam, Output quality, Model spend; Canary pages.
- **Every sub-menu item is its own page.** The rail label, the breadcrumb and the page title use the same names, for example "Setup / What Noma sells" over a page titled "What Noma sells".
- **"What we found" becomes "Changes"** on the rail, with the page titled "Competitor changes", because the page lists competitor posts and page changes.
- **"View as" moves into the user menu.** A "Viewing as …" pill stays in the top bar.

## Why

- One name per page, used in the rail, the breadcrumb and the title, so an owner always knows where they are and what to click.
- Separate pages mean an owner opens the prompt they came to change, instead of scrolling past six others.
- Owners never see the Builder item, which keeps the line from the "View as" work (owners must not see the builder area).
- The look follows tools the owners already use (Slack's rail, Port's sub-menu) and keeps Noma's colours rather than Slack's.

## Alternatives considered

- **Keep "Feed" as the rail label.** It describes the layout, not what is on the page.
- **Keep the full-width "View as" bar, as Port does.** It takes the top of every page for something changed rarely.
- **Make the team filter the Changes sub-menu.** It would give "All teams" as a page title, which says less than "Changes".

## Consequences

- This is screen polish, which [0010](0010-trust-before-experience.md) deferred until after submission. Guy chose to do it now, and kept it to navigation and layout only.
- Pages moved: `/settings/<section>` and `/ops/<section>`. `/settings` and `/ops` open their first page, and Slack links point to the new pages. Old bookmarks with `#suggestions` land on Competitors.
