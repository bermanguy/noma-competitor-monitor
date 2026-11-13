# Demo script (five minutes)

The video and every day's plan follow this script. A step is done only when it runs on the live URL with real data, or with the canary where noted.

| # | Time | What the viewer sees | Proves | Status |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:30 | The problem: four competitors, three teams, too much noise | Framing | Script only |
| 2 | 0:30–1:30 | One real competitor post in Slack: teams get it at different levels, each with its own reason and quote; the Changes page shows why the others didn't | Per-team judgment with evidence | Proven live (Zenity voice-agent post: Urgent for Product, Worth knowing for R&D and Marketing) |
| 3 | 1:30–2:15 | The canary page changes on purpose and arrives as a before/after with an explanation; a cosmetic edit is logged, not sent. On the pricing canary, a yearly price changes and the alert says exactly that | Changed pages, noise control | Proven live |
| 4 | 2:15–3:15 | The owner adds HiddenLayer by typing its domain, sees the sources and first items found, adds a topic, sets a team's noise level | Self-service without engineering | Proven live |
| 5 | 3:15–4:00 | **The Head of Product tunes the judge, no Builder needed.** Product got the Straiker EU/India regions post as Urgent. Signed in as Product's owner: 👎 "data residency isn't act-today" → the ping lands in the owners' channel → Setup › Preview next digest › Product → edit "What Product cares about" (new regions and data residency are Worth knowing, not Urgent) → **Try my edit** shows Straiker move from Urgent to Worth knowing → Save → Setup › To review → add it to the golden set. Close on Builder › Evals: the item is now a test case, and the page says in one line how the run compares with the baseline | Output quality, how it improves, and who owns it | Live over-call kept on purpose for the recording |
| 6 | 4:00–4:40 | The Builder area shows source health, runs, failures and cost per run; the ops channel shows a failure alert | Runs unattended, 3 a.m. failures | Proven live |
| 7 | 4:40–5:00 | This is an MVP: first the owners and a few business users validate accuracy with their votes, then we widen and add sources (release notes, technical channels for R&D), then the podcast briefing | Judgment about scope | Script only |

## Golden examples the demo depends on

Covered by the golden set in `evals/golden/`: at least one post that matters to several teams for different reasons, one that matters to one team only, one quiet page change, one cosmetic change, and one weak claim that should be withheld.

## Before recording step 5

- **Don't fix the Straiker over-call first.** Leave Product's description as it is, so the live Urgent alert is still there to correct on camera.
- "Try my edit" re-judges Product's 5 most recent items from the last 30 days, test pages excluded. If newer posts push Straiker out of those 5, it won't show in the trial. Do a dry run shortly before recording, and don't press Save during it.
- One owner per team can fine-tune it: sign in as Product's owner, not as the Builder.
- Running the evals and changing the baseline stay with the Builder. The owner's 👎, the edit, the trial and "add to the golden set" need no Builder access.
