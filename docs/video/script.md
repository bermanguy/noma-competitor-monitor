# Demo video: scene-by-scene script

About 8 minutes when read slowly (about 860 spoken words at 120 words a minute, plus slides and clicks). Recorded as one take, with a webcam circle over the screen recording. A short title slide goes before each scene, added in editing. The plain words to read, with nothing else, are in [teleprompter.txt](teleprompter.txt).

The brief asks for a video of "no more than five minutes" in which we present what we built, why, the decisions that mattered, what we left out, and a demo where we configure the system the way its users would. Each scene below names the grading criterion it proves.

| # | Slide title | Proves | Time |
| --- | --- | --- | --- |
| 1 | Know what matters, team by team | The problem | 0:30 |
| 2 | How it works, in one picture | Technical design, technology choices | 0:55 |
| 3 | One change, three verdicts, with proof | Assessing what matters, for whom; noise | 1:05 |
| 4 | Teams get it in Slack | Delivery to the people who need it | 0:40 |
| 5 | Anyone can say "this wasn't urgent" | Output quality: feedback | 0:30 |
| 6 | Owners improve the system without the Builder | Self-sufficiency, output quality | 2:00 |
| 7 | The business adds a competitor, no engineering | Self-sufficiency: configuring what is watched | 0:40 |
| 8 | It runs at 3 a.m. with nobody watching | Production readiness, the separate Builder surface | 0:40 |
| 9 | An MVP, rolled out to earn trust first | What was left out, what's next, AI used | 0:40 |
| | | **Total, with slides and clicks** | **about 8:00** |

How to read each scene: **Slide** is the title card. **Say** is what you read. **Screen** is what's showing and the clicks, in order, with `▸` marking where in the words to click. **Camera** says where the circle sits.

---

## Scene 1. Know what matters, team by team

- **Slide:** Know what matters, team by team. Subtitle: *Competitor Monitor for Noma*
- **Time:** 0:30 (about 65 words)
- **Screen:** the Changes page, untouched, as a backdrop.
- **Camera:** large, centre or lower right. This is the only scene where your face is the main thing.

**Say:**

> Noma's competitors publish something almost every week. Today, someone skims their sites by hand. Things get missed, and big news reaches sales days late. And "important" means something different to Marketing, Product and R&D.
>
> So I built a competitor monitor. It judges every change once for each team, and tells each team only what clears its own bar, with proof.

---

## Scene 2. How it works, in one picture

- **Slide:** How it works, in one picture
- **Time:** 0:55 (about 105 words)
- **Screen:** the architecture diagram from the design doc on GitHub (`docs/design.md`, section 2), zoomed so the boxes fill the screen. Optionally have the "Who uses what" table from the README ready and scroll to it on the last paragraph.
- **Camera:** small, top right (the diagram sits in the middle).

**Say:**

> Every three hours, a scheduled job reads the competitors' blogs and key pages: the homepage, product pages, pricing.
>
> A new post is a link we haven't seen before. A quiet page change is text that changed, and a small model filters out cosmetic edits.
>
> Then Claude judges each change once, for all three teams: a level, a one-line reason, and a quote from the page. Code checks that the quote really is on the page. If it isn't, nothing is sent.
>
> ▸ *(scroll to "Who uses what")* Three kinds of people use it. Team members get Slack. Each team's owner sets things up in the web app. And I, the builder, have a separate area for sources, runs and quality.

---

## Scene 3. One change, three verdicts, with proof

- **Slide:** One change, three verdicts, with proof
- **Time:** 1:05 (about 120 words)
- **Screen and clicks:**
  1. Live site, **View as › Maya** (Product owner). Changes page, **All teams** view.
  2. ▸ Click the Zenity row *"Your Voice AI Agent Takes Calls From Strangers"* to open it.
  3. Point at Product's Urgent, then R&D and Marketing's Worth knowing, then a quote, then the "Sent to Slack as an alert" line.
  4. ▸ Open a cosmetic change (a row that reads *"Not judged: cosmetic change"*, from **+ Filter › not judged**).
- **Camera:** bottom left, so it doesn't cover the level column on the right.

**Say:**

> This is the Changes page. ▸ Here's a real post from Zenity, about securing voice AI agents.
>
> Same post, three verdicts. For Product, it's Urgent: voice agents are a surface Noma doesn't list today. For R&D and Marketing, it's Worth knowing, so it waits for their morning digest. Each verdict comes with its reason and a quote from the page, and shows exactly when it went to Slack.
>
> We use four named levels, not a score from one to ten. Models squeeze scores toward the middle, and nobody can act on a "six".
>
> ▸ And most changes never reach anyone. This one is a cosmetic edit on a page. It's logged here, and not sent.

---

## Scene 4. Teams get it in Slack

- **Slide:** Teams get it in Slack, not in another tool
- **Time:** 0:40 (about 70 words)
- **Screen and clicks:**
  1. Slack, `#competitors-product`: the Zenity alert. Zoom in on the reason, the quote and the 👍 / 👎 links.
  2. ▸ `#competitors-marketing`: the latest morning digest, grouped by topic, with the single "Rate these updates" link at the bottom.
- **Camera:** top right (the Slack buttons are at the bottom of each message).

**Say:**

> Business users don't need to open the app. Product got this alert the moment it was found: who, what, why it matters to Product, and the quote. Under it: Useful, or Not useful.
>
> ▸ Everything less urgent arrives once, in the morning, as a short digest grouped by topic, with one link to rate it all.
>
> Teams already live in Slack, so that's where it goes.

---

## Scene 5. Anyone can say "this wasn't urgent"

- **Slide:** Anyone can say "this wasn't urgent"
- **Time:** 0:30 (about 50 words)
- **Screen and clicks:**
  1. `#competitors-product`: the Straiker alert *"Straiker EU & India Expansion"*, sent as Urgent.
  2. ▸ Click **👎 Not useful**. The rating page opens. Type the reason: *Data residency is worth knowing, not act-today.* Submit.
  3. ▸ `#competitors-owner`: the ping, *"Product marked an alert not useful … please review"*.
- **Camera:** top right.

**Say:**

> But not every call is right. Product got Straiker's new EU and India regions as Urgent.
>
> ▸ Tamar, on the Product team, disagrees. She presses Not useful and writes why.
>
> ▸ The vote goes straight to the owners' channel, and pings Maya, who owns Product.

---

## Scene 6. Owners improve the system without the Builder

The heart of the video. Take it slowly.

- **Slide:** Owners improve the system without the Builder
- **Time:** 2:00 (about 240 words). The check that runs on Save takes about 2 minutes: keep recording, stay quiet, and cut the wait in editing.
- **Screen and clicks:**
  1. **View as › Maya**. ▸ **Setup › To review**: Tamar's vote, with the judge's level and her reason.
  2. ▸ **Setup › Preview next digest › Product**. In "What Product cares about", add the sentence (have it on your clipboard):
     *New cloud regions and data residency options are Worth knowing, not Urgent.*
  3. ▸ Press **Try my edit on the last 5 changes**. Point at Straiker: Urgent → Worth knowing. The other rows don't move.
  4. ▸ Press **Save**. The page reads "Checking your edit against 31 test posts…". *(Pause, cut in editing.)*
  5. ▸ The result: *"Saved. Checked on 31 test posts: nothing got worse."* Point at Marketing and R&D, unchanged, and at Straiker now matching the answer key.
  6. ▸ Back to **Changes**, open the Straiker row: it still shows Urgent, as it was sent.
- **Camera:** bottom left. Move it to top left for step 5 if the result panel is at the bottom.

**Say:**

> ▸ Maya is Head of Product. She isn't an engineer, and she doesn't need me. In To review, she sees Tamar's vote, and she agrees: new regions matter, but not today.
>
> ▸ What Product hears about is written in plain English. So she edits Product's description: new cloud regions and data residency are Worth knowing, not Urgent.
>
> ▸ Before saving, she presses Try my edit. It re-judges Product's latest changes with her new wording. Straiker moves from Urgent to Worth knowing. Nothing else moves.
>
> ▸ Now she saves. Saving runs a check by itself. The whole golden set, thirty-one real posts with the right answer for every team, is judged again with her wording.
>
> *(pause while it runs)*
>
> ▸ Nothing got worse. Her wording only describes Product, and the check proves it didn't shift Marketing or R&D. Product can't break Marketing. And the Straiker post, which is one of the test posts, now gets the answer it should.
>
> If something had gotten worse, she'd see exactly which post. She could narrow her wording, or save anyway, and I'd just get a note.
>
> ▸ One more thing. This only changes what happens next. The alert Tamar got stays in the history, as it was sent. We don't rewrite the past. We improve the system from here on.
>
> A complaint became a better rule and a passing test, in two minutes, with no builder involved.

---

## Scene 7. The business adds a competitor, no engineering

- **Slide:** The business adds a competitor, no engineering
- **Time:** 0:40 (about 75 words)
- **Screen and clicks:**
  1. **Setup › Competitors** ▸ **Add a competitor**. Name: *HiddenLayer*. Website: *hiddenlayer.com*. Next.
  2. ▸ Step 2: the pages it found (blog, newsroom, product pages), each with its latest post titles. Leave the defaults. Start watching.
  3. ▸ Step 3: each page is read, with a live status per page, then "All set".
- **Camera:** bottom right (the wizard is centred).

**Say:**

> Owners also decide what we watch. ▸ Maya adds HiddenLayer, just by typing its website.
>
> ▸ The system reads the site's menu and finds where it publishes: its blog, its newsroom, its product pages, with the latest titles as proof. She keeps the ones she wants.
>
> ▸ The first check reads each page now, so from the next run, anything new gets judged. Removing a competitor later hides it, but never deletes its history.

---

## Scene 8. It runs at 3 a.m. with nobody watching

- **Slide:** It runs at 3 a.m. with nobody watching
- **Time:** 0:40 (about 85 words)
- **Screen and clicks:**
  1. **View as › Guy** (Builder). ▸ **Builder › Overview**: the eight numbers, each with its target.
  2. ▸ Scroll to the alert rules table.
  3. ▸ Slack `#competitors-ops`: a real failure alert for a source.
- **Camera:** top right.

**Say:**

> Nobody presses Run. It runs on Render every three hours by itself, and an outside heartbeat alerts if a run is ever missed.
>
> ▸ This is my area, as the builder. Eight numbers, each with a target: runs on schedule, healthy sources, Slack delivery, judge precision, quotes verified, rated useful, and spend against a monthly cap.
>
> ▸ When a source breaks, or a site starts blocking us, the others keep running, ▸ and the alert comes to the ops channel, not to the teams.

---

## Scene 9. An MVP, rolled out to earn trust first

- **Slide:** An MVP, rolled out to earn trust first. Three lines on the slide, shown one at a time as you say them: *1. Owners and a few users per team* · *2. The full teams* · *3. More sources: release notes for R&D*
- **Time:** 0:40 (about 85 words)
- **Screen:** the slide stays up, or the design doc's section 7.
- **Camera:** large again, like scene 1.

**Say:**

> This is an MVP, and I left things out on purpose: social media, press wires, job posts, and single sign-on.
>
> The rollout is part of the design. First, the three owners and a few users per team, checking accuracy with their votes, because every vote can become a test. Then the full teams. Then more sources, starting with release notes and changelogs for R&D.
>
> I built it with Claude Code as my pair programmer, and Claude models do the judging. Thanks for watching.

---

## Before you record

Do a full dry run on the live site about an hour before, **without pressing Save in scene 6**.

- **Straiker must still be an Urgent over-call.** Don't edit Product's description before recording. Try my edit re-judges only Product's 5 most recent changes, so check that Straiker is still among them. If newer posts pushed it out, tell the Builder thread before recording.
- **The automatic check on Save** is being built tonight in the "Calibrate judge and rehearse the demo" thread. After it merges, try it once on a different post (that thread will name one), and match the on-screen wording in scene 6 to what the page actually says.
- **HiddenLayer.** If HiddenLayer is already being watched, remove it in Setup › Competitors before recording, and check that adding it again still walks through all three steps. If it doesn't, use another competitor's domain for scene 7.
- **Cosmetic change for scene 3.** Find a row that reads "Not judged: cosmetic change" and note it. If there's none, change the canary page cosmetically from Builder › Canary pages beforehand.
- **Ops alert for scene 8.** Scroll `#competitors-ops` to a real source failure and leave it there.
- **Slack.** Open the three channels you'll use in tabs, in order: product, marketing, owner, ops. Mute notifications on the computer.
- **Browser.** Zoom to 125%, hide bookmarks and other tabs, and sign in with the shared password before you start. Copy the scene 6 sentence to the clipboard.
- **Camera circle.** Each scene says where to put it, so it never covers what you point at.

## Recording one take, ready for editing

- At the end of each scene, **stop for three seconds and look at the camera**. Those silences are the cut points for the title slides.
- If you stumble, pause, then restart the whole sentence. The silence makes the bad take easy to find and cut.
- Before each scene, say the scene number out loud ("Scene six"), then pause. It makes the cut points easy to find in the transcript, and it's removed in editing.
- Speak slower than feels natural. The word counts above already assume a slow pace.

## Title slides for editing

One slide per scene, about 3 seconds each, in this order. The titles are also the first line of each scene above, so Claude Code can build the slides and the cuts from this file.

1. Know what matters, team by team
2. How it works, in one picture
3. One change, three verdicts, with proof
4. Teams get it in Slack, not in another tool
5. Anyone can say "this wasn't urgent"
6. Owners improve the system without the Builder
7. The business adds a competitor, no engineering
8. It runs at 3 a.m. with nobody watching
9. An MVP, rolled out to earn trust first
