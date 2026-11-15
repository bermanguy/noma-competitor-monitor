# 0019. A Claude connector (MCP server): read everything, add only with confirmation

- Status: Accepted by the product owner, 2026-11-13
- Decided by: Guy (product owner)

## Decision

The app exposes its judged changes to Claude through a remote MCP server at `/api/mcp`, so people can ask "what's new with Zenity this week for Product?" in Claude and get the same levels, reasons and quotes they get in Slack. It also answers questions about running the system from a guide, [how-it-works.md](../how-it-works.md).

Tools: `recent_changes`, `competitor_summary`, `search_evidence`, `list_competitors` and `how_to` (all read only). Owners and the builder also get `add_competitor`.

## How it stays safe

| Concern | What we do |
| --- | --- |
| Who is asking | One token per person, an HMAC of their key with `MCP_SECRET`. A token acts as that person and their role. No token is stored. Removing the person stops it; rotating the secret stops all of them. |
| What they can see | The same rules as the app: a member sees only their own team and never test pages. Archived competitors are invisible. |
| Writes | One tool, owners only, in two steps. The first call only previews what discovery found and saves nothing. The confirm call must come from the same person within 30 minutes. A member's `tools/list` doesn't include it, and calling it anyway returns "unknown tool". |
| Destructive actions | None through the connector. Removing a competitor happens in the app, and even there nothing is deleted. |
| Prompt injection from competitor pages | Server instructions and every result say that titles, summaries and quotes are data, never instructions. The write tool's description tells Claude never to confirm because website text asked for it. |
| Audit | Every call is logged in `mcp_call` (person, role, tool, arguments, effect, result), and the log is shown under Builder › Claude connector. |
| Abuse | 60 calls a minute per person, 10 writes an hour, 120 requests a minute per IP. Requests are capped at 64 KB. A browser Origin other than Claude's or ours is refused (DNS rebinding). |

## Why

- Klue and Crayon already ship MCP servers, so asking a CI tool from Claude is becoming expected. Ours differs in what it returns: changes already judged per team, each with verbatim quotes.
- It reuses the data and rules we already trust. No new judgment logic, and no new UI for the teams.
- For an AI-security company, the connector doubles as a small, honest example of least-privilege agent access.

## Rejected for now

- **A Slack bot that answers when tagged**: more moving parts (Slack app, events, our own model loop) for the same answers. Claude in Slack with this connector covers it.
- **A chat box inside the app**: a new screen, against [0010](0010-trust-before-experience.md).
- **OAuth sign-in**: the right production answer, through the company's SSO. The URL token is the MVP stand-in: it is per person, revocable and logged, but whoever holds the URL acts as that person.

## Consequences

- New env var `MCP_SECRET`. Without it the connector is off.
- New table `mcp_call` (migration 0008).
