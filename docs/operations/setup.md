# Setup checklist: from now to "running on its own"

About 30 minutes in total. Do the steps in order. Each step says **what** to do and **why**.

---

## Step 1. Merge the two open PRs (2 min)

| PR | What it does | Why it matters for setup |
| --- | --- | --- |
| [#8 Golden set and eval](https://github.com/bermanguy/noma-competitor-monitor/pull/8) | The exam that grades the judge per team | Shows output quality in the demo |
| [#10 Ops alerts for run errors](https://github.com/bermanguy/noma-competitor-monitor/pull/10) | #ops hears about crashes, the budget stop and broken webhooks | Without it, a wrong Slack webhook fails silently |

**How:** open each link → **Merge pull request** → **Confirm**. Both have green checks.

**What happens:** Render sees the new code on `main` and redeploys both services automatically (about 5 minutes). You don't need to do anything there.

A third PR is coming in the next hour or so: the owner channel. Merge it the same way when I send it.

---

## Step 2. Create 5 Slack channels (5 min)

In your Slack workspace: the **+** next to "Channels" → **Create channel**. Use these exact names (the system doesn't care about names; they're just for people).

| Channel | Who reads it | What arrives there |
| --- | --- | --- |
| `#competitors-marketing` | Marketing | Urgent alerts and the morning digest for Marketing |
| `#competitors-product` | Product | Same, for Product |
| `#competitors-rnd` | R&D | Same, for R&D |
| `#competitors-owner` | You (the business owner) | Decisions only: suggestions to approve, a team unhappy with its items |
| `#competitors-ops` | The builder/operator | Breakages only: failing sources, crashes, budget, delivery failures |

**Why five:** the teams get news, the owner gets decisions, and the builder gets breakages. Nobody has to filter out noise meant for someone else.

---

## Step 3. Create one Slack app with 5 webhooks (10 min)

A **webhook** is a secret web address. Anything posted to it appears in one specific channel. The system needs one per channel.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name: `Competitor Monitor`. Workspace: yours. → **Create App**.
3. In the left menu: **Incoming Webhooks** → turn **Activate Incoming Webhooks** to **On**.
4. At the bottom: **Add New Webhook to Workspace** → choose `#competitors-marketing` → **Allow**.
5. Repeat step 4 for the other four channels.
6. You now see 5 URLs, each starting with `https://hooks.slack.com/services/...`. Keep this page open for Step 5.

**Never paste these URLs in chat or in the repo.** Anyone who has one can post to that channel. They only go into Render (Step 5).

---

## Step 4. Get the two remaining secrets (5 min)

**a. Anthropic API key** (lets the system call Claude)
1. [console.anthropic.com](https://console.anthropic.com) → **API Keys** → **Create Key** → name it `competitor-monitor` → copy it (it's shown only once).
2. Recommended: **Limits** → set a monthly spend limit (for example $50). The system also stops itself at $40 a month, so this is a second safety net.

**b. Database address** (tells the app where its database is)
1. Open [the database in Render](https://dashboard.render.com/d/dpg-dbqnla6i0phs73d80v0g-a) → **Connect** (top right).
2. Copy the **Internal Database URL**. It starts with `postgresql://`. "Internal" means the services reach it inside Render's private network, which is faster and never exposed.

---

## Step 5. Put the secrets into Render, once for both services (5 min)

Both services need the same secrets. The **web service** shows the pages and has the "Run now" button. The **cron job** runs every 3 hours. An **Environment Group** holds them once and shares them with both.

1. Render dashboard → left menu **Environment Groups** → **New Environment Group** → name: `competitor-monitor-secrets`.
2. Add these variables (**Add Environment Variable** for each):

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the Internal Database URL from Step 4b |
| `ANTHROPIC_API_KEY` | the key from Step 4a |
| `SLACK_WEBHOOK_MARKETING` | webhook for `#competitors-marketing` |
| `SLACK_WEBHOOK_PRODUCT` | webhook for `#competitors-product` |
| `SLACK_WEBHOOK_RND` | webhook for `#competitors-rnd` |
| `SLACK_WEBHOOK_OWNER` | webhook for `#competitors-owner` |
| `SLACK_WEBHOOK_OPS` | webhook for `#competitors-ops` |

3. **Create Environment Group**.
4. Link it to both services:
   - [web service](https://dashboard.render.com/web/srv-dbqogtdg1s2s73ev6km0/env) → **Environment** → **Link Environment Group** → pick `competitor-monitor-secrets`.
   - [cron job](https://dashboard.render.com/cron/crn-dbqoh5jbc2fs73e0crag/env) → **Environment** → **Link Environment Group** → same.

Already set by me on both services, so leave them alone: `PUBLIC_URL`, `APP_TIMEZONE`, `BUDGET_PER_MONTH_USD`, `FEEDBACK_SECRET`, and the two passwords on the web service.

**What happens:** linking the group restarts the web service. On start, it creates the database tables and loads the starting competitors, topics and teams. That takes about 2 minutes.

---

## Step 6. Find your two passwords (1 min)

The app has two doors with different passwords:

| Password | Opens | For |
| --- | --- | --- |
| `OWNER_PASSWORD` | Feed and Settings | The business owner |
| `OPS_PASSWORD` | `/ops` (and everything else) | The builder/operator |

Where: [web service → Environment](https://dashboard.render.com/web/srv-dbqogtdg1s2s73ev6km0/env) → click the eye icon next to each.

When the browser asks you to sign in, type anything as the username and the password as the password.

---

## Step 7. "Is it still running?" heartbeat (5 min)

**Why:** if the cron itself stops, nothing inside the system can notice. An outside service expects a "still alive" ping after every run and alerts if pings stop.

1. Sign up free at [healthchecks.io](https://healthchecks.io).
2. **Add Check** → name `competitor-monitor`. Set **Period** to `3 hours` and **Grace** to `1 hour` (runs every 3 hours, with an hour of slack).
3. Copy the **ping URL** (`https://hc-ping.com/...`).
4. Add it to the `competitor-monitor-secrets` group from Step 5 as `HEARTBEAT_URL`.
5. In healthchecks.io → **Integrations** → add **Slack** → pick `#competitors-ops`. Missed runs are a builder problem.

---

## Step 8. First run (I take it from here)

1. Open the web address [competitor-monitor-kqys.onrender.com/ops](https://competitor-monitor-kqys.onrender.com/ops) and sign in with `OPS_PASSWORD`.
2. Click **Run now**, then tell me in the thread.

**What the first run does** (about 5 to 10 minutes):
- Reads all 19 sources.
- Saves every page as its "before" picture. Pages are never alerted on the first visit; a page change needs a "before".
- Judges the latest 3 posts per blog (about 21 posts, about $1 to $2). They go to the team digests, labelled "published before monitoring started".
- Sends a note to `#competitors-ops` for any source that failed. I fix those.

**Then I:** check every source, fix the ones that failed, add about 20 real posts to the exam, and run the exam.

After that it runs on its own every 3 hours, and the digest arrives at 08:00 Israel time.

---

## Optional: the Claude connector (5 min)

Lets people ask Claude about competitors (decision 0016).

1. **Render** › Environment group `competitor-monitor` › add `MCP_SECRET` with a long random value (for example, the output of `openssl rand -hex 32`). Save. Both services redeploy.
2. **The app** › Builder › Claude connector (`/ops/connector`). Copy the address for the person who will use it. Use an owner's address to demo adding a competitor.
3. **Claude** › Settings › Connectors › **Add custom connector**. Give it a name (Competitor Monitor), paste the address and click Add. In a chat, turn it on from the tools menu.
4. Ask, for example: "What's new with Zenity this week for Product?", "Who talks about MCP gateways?", "How do I remove a competitor?".

The address acts as that person, so treat it like a password. To revoke one address, remove the person in Setup › People. To revoke all of them, change `MCP_SECRET`.

For Claude Code: `claude mcp add --transport http competitor-monitor https://<your app>/api/mcp --header "Authorization: Bearer <token>"`, where the token is the last part of the address.
