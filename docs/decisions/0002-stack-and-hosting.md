# 0002. Stack and hosting

- Status: Accepted, 2026-11-12
- Decided by: Guy (deployed URL required; Render acceptable), Claude (language and framework)

## Decision

TypeScript end to end: Next.js for both web surfaces, a Node pipeline worker in the same repo, Drizzle ORM, Render Postgres, deployed on Render (a web service and a cron job, from one Docker image based on the Playwright image).

## Why

- The owner's strongest stack is TypeScript and React, and he has to defend every line in a 90-minute review.
- Node has what the pipeline needs: Playwright (built for Node), Mozilla Readability, a mature feed parser, and a first-class Anthropic SDK with Zod-validated structured output.
- One app, one database, one deploy removes the integration seam that caused most of the complexity in the earlier attempt.
- Render is already familiar to the owner and gives a real URL, a managed scheduler and managed Postgres in one place. Neon was the first choice; Render Postgres won because one provider means one network, one bill and one dashboard (changed 2026-11-12).

## Considered

- **Python** (FastAPI, trafilatura): slightly better extraction libraries, but weaker to defend for this owner.
- **Base44 for the UI:** fastest UI, but splits the system and moves configuration into a no-code builder.
- **Serverless (Vercel functions + external cron):** headless browsers and long runs fit poorly in function time limits.
