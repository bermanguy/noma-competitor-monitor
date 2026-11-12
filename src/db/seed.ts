import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { competitor, source, team, topic, type SourceKind } from "./schema";

const owner = (f: string) => readFileSync(join(process.cwd(), "src/prompts/owner", f), "utf8").trim();

export const TEAMS = [
  { key: "marketing", name: "Marketing", lens: () => owner("lens.marketing.md"), slackWebhookEnv: "SLACK_WEBHOOK_MARKETING" },
  { key: "product", name: "Product", lens: () => owner("lens.product.md"), slackWebhookEnv: "SLACK_WEBHOOK_PRODUCT" },
  { key: "rnd", name: "R&D", lens: () => owner("lens.rnd.md"), slackWebhookEnv: "SLACK_WEBHOOK_RND" },
];

interface SeedSource { kind: SourceKind; url: string; label: string; linkPrefix?: string }

/** Decision 0001. Source URLs are verified in the fetch spike and adjusted on the operator page. */
export const COMPETITORS: { name: string; domain: string; sources: SeedSource[] }[] = [
  { name: "Zenity", domain: "zenity.io", sources: [
    { kind: "listing", url: "https://zenity.io/blog", label: "Blog", linkPrefix: "/blog" },
    { kind: "page", url: "https://zenity.io/", label: "Homepage" },
  ] },
  { name: "Pillar Security", domain: "pillar.security", sources: [
    { kind: "listing", url: "https://www.pillar.security/blog", label: "Blog", linkPrefix: "/blog" },
    { kind: "page", url: "https://www.pillar.security/", label: "Homepage" },
  ] },
  { name: "Lasso Security", domain: "lasso.security", sources: [
    { kind: "listing", url: "https://www.lasso.security/blog", label: "Blog", linkPrefix: "/blog" },
    { kind: "page", url: "https://www.lasso.security/", label: "Homepage" },
  ] },
  { name: "Straiker", domain: "straiker.ai", sources: [
    { kind: "listing", url: "https://www.straiker.ai/blog", label: "Blog", linkPrefix: "/blog" },
    { kind: "page", url: "https://www.straiker.ai/", label: "Homepage" },
  ] },
];

/** Idempotent: safe to run on every deploy. Never overwrites what the owner or operator edited. */
export async function seed(db: DB, publicUrl: string) {
  for (const t of TEAMS) {
    await db.insert(team).values({ key: t.key, name: t.name, lens: t.lens(), slackWebhookEnv: t.slackWebhookEnv }).onConflictDoNothing();
  }
  if ((await db.select({ id: topic.id }).from(topic).limit(1)).length === 0) {
    const topics = JSON.parse(owner("topics.json")) as { name: string; description: string; teamKeys: string[] }[];
    await db.insert(topic).values(topics);
  }
  const canaryHost = new URL(publicUrl).hostname;
  const all = [
    ...COMPETITORS,
    { name: "Canary (test page)", domain: canaryHost, sources: [{ kind: "page" as const, url: `${publicUrl}/canary`, label: "Canary page" }] },
  ];
  for (const c of all) {
    await db.insert(competitor).values({ name: c.name, domain: c.domain }).onConflictDoNothing();
    const [row] = await db.select().from(competitor).where(eq(competitor.domain, c.domain));
    for (const s of c.sources) {
      await db.insert(source).values({ competitorId: row!.id, ...s }).onConflictDoNothing();
    }
  }
}
