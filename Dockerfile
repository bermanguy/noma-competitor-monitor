# One image for the web app and the scheduled pipeline. Based on the Playwright image so the
# headless-browser fallback works for JavaScript-rendered sources.
FROM mcr.microsoft.com/playwright:v1.65.0-noble AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.65.0-noble
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
# The web service runs migrations and the idempotent seed on start; the cron job runs the pipeline.
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts && npx next start -p ${PORT:-3000}"]
