# MVP scope

Frozen 2026-11-12. Changes only when Guy explicitly changes it; each change is noted at the bottom with its date.

## The product in one sentence

Watch four competitors' blogs and key pages, judge every new post or quiet page change separately for Marketing, Product and R&D, and post what matters to each team's Slack channel with the evidence and the reason.

## In

| Area | In scope |
| --- | --- |
| Competitors | Zenity, Pillar Security, Lasso, Straiker ([0001](decisions/0001-competitors-to-monitor.md)); HiddenLayer added live in the demo; one canary page we control |
| Source kinds | RSS/Atom feed, listing page (blog index), watched page (homepage, platform/product, integrations, changelog where one exists) |
| Page types | General (text diff and gate) and pricing (plans, monthly and yearly prices and features compared field by field), chosen per page by the owner |
| Fetching | Plain HTTP by default, headless browser as a per-source fallback |
| Detection | New post = unseen canonical URL. Page change = extracted main text differs after normalisation. First crawl is a silent baseline, except the latest 3 posts per competitor, judged and labelled as published before monitoring |
| Judgment | One structured judgment per item per team: relevance level, reason, verbatim evidence quote, matched topics. Quotes are checked against the source text |
| Delivery | Slack, one channel per team: immediate post for the top level, daily digest for the next level. Everything else visible in the web feed with its reason |
| Feedback | Useful / not useful with a reason, per item per team, from a link in Slack |
| Improvement | Hand-labelled golden set, per-team precision and recall on every prompt or rubric change; rated items feed back as examples |
| Owner surface (web) | Add a competitor by domain, topics, team lenses in plain English, per-team noise level, feed of all items |
| Operator surface (web) | Source health, runs, failures, cost, eval results, per-source overrides |
| Running unattended | Scheduled runs on Render, retries, per-source isolation, ops alerts for failures, empty sources and missed runs |
| Stack | TypeScript, Next.js, Render Postgres, Render web service and cron job, Claude API |

## Out

Social media, press wires, review sites, job postings. Cross-source deduplication with embeddings. SSO and roles beyond a shared secret per surface. Email, Slack interactive buttons, Teams. Automatic prompt or threshold tuning. Trends, capability maps and competitor profiles. Queues, workers, Kubernetes. UI polish beyond clear.

## Change log

- 2026-11-12: frozen.
- 2026-11-12: database on Render Postgres instead of Neon (one provider, one bill). Watched pages per competitor widened beyond the homepage. First check judges the latest 3 posts per competitor, labelled, digest only. The four confirm-first choices confirmed. Pricing page type added, demoed on a pricing canary because none of the four competitors publishes prices.
- 2026-11-12: until submission, trust before experience: effort goes to monitoring, judgment and noise; UI polish is deferred (decision 0010).
- 2026-11-12: "not useful" votes are listed for the owner in Settings and can be added to the exam with the right level per team (decision 0011). No new channel, schedule or user.
