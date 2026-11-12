# 0004. Starting topics come from Noma's own pillars

- Status: Accepted by the product owner, 2026-11-12
- Date: 2026-11-12
- Decided by: Guy (product owner), before the first live run

## Context

Topics are owner-owned themes, each with the teams it matters to. They go into the judgment prompt and label each judgment. The first draft had five topics, taken from what the four competitors write about most (MCP security, coding agents, agent runtime protection, category language, funding and M&A).

Reviewing the list before the first run, the owner asked whether it reflected Noma's own pillars and pointed out that red teaming was missing. It was: AI red teaming is one of Noma's four products, and it is where competitors publish the most attention-grabbing research.

## Decision

Derive the starting topics from Noma's own positioning ([homepage](https://noma.security/), [platform](https://noma.security/platform)): its products (AI-SPM, AI-DR, agent access control, AI red teaming) and solutions (MCP security, AI supply chain, compliance, and the three agent environments: endpoint, SaaS, cloud). The eleven topics and their teams are in [`src/prompts/owner/topics.json`](../../src/prompts/owner/topics.json).

| Topic | Matters to |
| --- | --- |
| AI asset discovery and posture (AI-SPM) | Product, R&D |
| Agent runtime security (AI-DR) | Product, R&D |
| Agent identity and access control | Product, R&D |
| MCP and agent skills security | Product, R&D |
| AI red teaming | Marketing, Product, R&D |
| AI supply chain security | Product, R&D |
| Coding and endpoint agents | Marketing, Product, R&D |
| SaaS and cloud agent platforms | Marketing, Product |
| AI compliance and governance | Marketing, Product |
| Category language | Marketing |
| Funding, M&A, partners and analysts | Marketing, Product |

## Why

- A topic list anchored on what Noma sells measures competitors against Noma's battlefield, not theirs. A competitor move in an area Noma does not sell in matters less; a move in red teaming or MCP matters a lot.
- Red teaming includes Marketing because competitors use vulnerability research as marketing (for example Zenity Labs and Pillar's sandbox-escape series), and Marketing needs to know when a rival owns a headline.
- Topics add weight and labels; they never force a level. Team briefs and level definitions still decide what is sent, so a broad topic cannot flood a channel.

## Consequences

- Decided before the first live run, so the first judgments (the latest posts per source) use this list.
- The seed adds a starting topic by name when it is missing, so the list also reaches an already-seeded database; topics the owner removed or edited in the app are left alone.
- Topics stay editable by the owner on the Competitors and topics page.
