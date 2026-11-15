# Competitor Monitor

Watches competitors' blogs and key pages, judges every new post or quiet page change separately for Marketing, Product and R&D, and posts what matters to each team's Slack channel, with the reason and a quote from the source.

**Status:** MVP. It rolls out first to the area owners and a few business users, to validate accuracy with their votes before widening and adding sources ([decision 0015](docs/decisions/0015-mvp-rollout-with-owners-first.md)).

**Live:** https://competitor-monitor-kqys.onrender.com (runs every 3 hours on its own)

## Demo video

**[Watch the demo on Google Drive](https://drive.google.com/file/d/1MQBp4jY40VQ0UZSmNSlSf9IpER-Nef8J/view?usp=sharing)**: what was built and why, the decisions that mattered, what was left out, and a live demo of an owner configuring it. It's too large for git, so it's linked rather than committed.

## Who uses what

| Who | Where | What they do |
| --- | --- | --- |
| Teams (Marketing, Product, R&D) | Slack, one channel each | Get **Urgent** alerts now and a **Worth knowing** digest each morning; rate items with 👍/👎 |
| Owner | Web app: Changes, Settings | Add a competitor by domain, edit topics, team descriptions and noise level, review "not useful" votes |
| Builder | Web app: Builder area (`/ops`) | Source health, runs, cost, the evals that grade the judge, and team feedback |

## Demo mode

There is no sign-in per person yet. Anyone with the link picks who they are from **View as**, to see each role: the Builder, an Owner (Marketing, Product or R&D) or a Member. The permissions behind each role are real and enforced on the server; only the sign-in is simulated. In production this would be company SSO, with each person's role and team set on the People page.

## Run it locally

Needs Node 22 and a Postgres URL. Copy [`.env.example`](.env.example) to `.env.local` and fill it in; [docs/operations/setup.md](docs/operations/setup.md) says where each value comes from.

```bash
npm install
npm run db:migrate && npm run seed   # tables + the four competitors
npm run dev                          # web app on :3000
npm run pipeline                     # one monitoring run
npm test                             # unit tests
npm run eval                         # evals on the golden set: per-team precision / recall
```

## Read next

- [Design doc](docs/design.md): architecture, choices, scale, quality, risks
- [Decisions](docs/decisions/): one short record per choice (0001 to 0019)
- [Scope](docs/scope.md)

## AI assistants used

Built with **Claude Code** (Anthropic), working as architect and pair programmer with the product owner: code, tests, docs and deploys went through reviewed pull requests. Inside the product, **Claude models** do the judging (Opus), page-change gating (Haiku) and pricing reading (Sonnet); see the design doc for why.
