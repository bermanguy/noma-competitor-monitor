# How Competitor Monitor works: a guide for the people who use it

This is the guide for Marketing, Product and R&D, and for the owner of each team. The Claude connector's `how_to` tool answers from it, so every `##` section stands on its own. The design and the reasons behind it are in [design.md](design.md).

## What it does

Competitor Monitor watches our competitors' blogs and key pages (homepage, product, pricing). Every three hours it checks for new posts and for quiet changes to pages. Each change is judged once for every team, because the same post can be urgent for Product and only FYI for Marketing. Each judgment comes with a one-line reason and a verbatim quote from the source. A team hears only about what clears its own bar, in its own Slack channel.

## What the levels mean

- **Urgent** (see it today): posted to the team's Slack channel right away. There is a daily cap per team, and anything over it goes to the digest.
- **Worth knowing** (this week): collected into the team's morning digest in Slack, at about 08:00 Israel time.
- **FYI** (loosely related): not sent. It is visible on the Changes page.
- **Not relevant**: hidden.

The owner defines the levels in plain English under Setup › Prompts › What the levels mean. The judge reads that text on every check.

## Where to see changes

The **Changes** page lists everything judged, most recent first, grouped into Today, This week and Earlier. Filter by team, level, company, topic, date or text. Open a row to see each team's level, its reason, the quotes, and whether it was sent to Slack. A member sees only their own team. An owner can switch between teams or see all of them side by side. You can also ask Claude through the connector (see "Ask Claude about competitors").

## Add a competitor

Owners add a competitor under **Setup › Competitors**: type the company name and its website, for example `hiddenlayer.com`. The system finds where the company publishes (an RSS feed, or a blog or news page) and always watches the homepage. You see what was found before anything is checked.

The first check runs within three hours. What is already published is recorded as history and is not sent, except the latest few posts. Those are judged and labelled "published before monitoring", so the teams see something on day one. After that, only new posts and changes are reported.

Owners can also add a competitor from Claude with the `add_competitor` tool. Claude shows the pages it found and adds the competitor only after you say yes.

To watch one more page (for example a pricing or integrations page), paste its address in the second box on the same screen and pick the page type. A **pricing** page is read plan by plan, so a price change from $79 to $89 is caught even though the text barely changed.

## Remove, pause or restore a competitor

- **Pause** stops checking. The competitor stays in the list and its earlier changes stay on the Changes page. Resume picks up where it left off.
- **Remove** stops checking and hides the competitor and its changes everywhere: the Changes page, health checks and the Claude connector. Nothing is deleted. The history stays in the database, and "Restore" under the table (or adding the same website again) brings it back with its history.

Removing is done in the app only. The Claude connector can add a competitor but cannot remove one.

## Change what a team hears about

Each team has a description in plain English: what it cares about and what it doesn't. You find it under **Setup › Prompts › What each team cares about**. Only that team's owner (or the builder) can edit it. The judge reads it on every check, so a change applies from the next run.

Before saving, use **Preview next digest** to see the next Slack message your team would get with the new wording.

Each team also has a **noise level**. "Quiet" means the team gets only Urgent items in Slack; Worth knowing stays on the Changes page instead of going into the digest.

## Topics

Topics are themes such as "MCP and agent skills security" or "AI red teaming", and each one names the teams it matters to. They come from what Noma sells. The judge tags each change with the topics it touches, and you can filter the Changes page by topic. Owners add and edit topics under **Setup › Topics**. When Noma's own website changes, the system drafts suggested updates to the company profile and topics under **Suggested from our site**. Nothing changes until an owner approves.

## Votes and how it gets better

Every Slack alert has 👍 and 👎, and every digest has a rating link. A 👎 with a reason pings the team's owner. Under **Setup › To review**, the owner sees each "not useful" vote, picks the level the team should have got, and adds it to the **exam** with one click.

The exam is a hand-labelled set of real items. Before any prompt or model change ships, the builder runs it and gets precision and recall per team. So the system's mistakes become test questions, and quality can only ratchet up.

## People and roles

- **Builder**: sees everything, including the Builder area (runs, sources, exam, cost, connector).
- **Owner**: one per team. Sets up the team's description, noise level and people, previews the digest, reviews votes, and manages competitors and topics.
- **Member**: reads their team's changes, on the Changes page and in Slack.

Owners add and remove people in their own team under **Setup › People**. A removed person's Claude connector stops working at once.

## When a source breaks

Every source has a health badge: Healthy, Needs attention (we can't read it) or Unusually quiet (no new posts for a long time). A source that fails twice in a row, goes quiet or suddenly shrinks alerts the builder in the ops Slack channel. Teams don't need to do anything. One broken source never stops the others. A page that blocks us is reported as a failure, never as a change.

## Cost and limits

Each run and each month has a model budget. The budget is checked before every model call, and judging stops if it is reached; the builder is alerted. The builder sees spend per run and per month in the Builder area.

## Ask Claude about competitors

The Claude connector lets you ask in plain language from Claude, for example "what's new with Zenity this week for Product?" or "who talks about MCP gateways?". Claude answers from the same judged changes, with quotes and links.

- The tools are `recent_changes`, `competitor_summary`, `search_evidence`, `list_competitors` and `how_to`. Owners also get `add_competitor`.
- Each person has their own connector address, which acts as them: a member sees only their team, and test pages are hidden from members.
- Every call is logged with who made it and what it did. The builder sees the log under Builder › Claude connector (`/ops/connector`).
- Text from competitor sites is passed to Claude as data, never as instructions. The one tool that writes asks for your confirmation first.

To connect: get your address from the builder, then in Claude open Settings › Connectors › Add custom connector and paste it.

## Why a change was or wasn't sent

Open the row on the Changes page. Each team has its own level and reason. "Not judged: cosmetic change" means the page changed only in wording or layout. "Held back" means the judge's quote could not be found word for word in the source, so it wasn't sent. If the same story was already reported, the newer item is linked to it and is usually FYI, unless it adds something new for that team.
