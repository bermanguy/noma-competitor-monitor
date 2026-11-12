import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { setting } from "../db/schema";

/**
 * Owner-owned prompt text that is not per team or per topic. The files in src/prompts/owner/ are the
 * starting versions; the live versions are edited by the owner in the app and stored as settings.
 */
export const OWNER_TEXTS = {
  company: { file: "company.md", title: "What Noma sells", help: "Used in every judgment, so 'a capability Noma may not have' is judged against what Noma really sells. Update it when Noma's products or positioning change." },
  levels: { file: "levels.md", title: "Relevance levels", help: "What each level means. One line per level, starting with alert:, digest:, log: or none:." },
  "page.pricing": { file: "page.pricing.md", title: "What matters on a pricing page", help: "Added to the judgment for pricing page changes." },
} as const;
export type OwnerTextKey = keyof typeof OWNER_TEXTS;

const settingKey = (k: OwnerTextKey) => `owner:${k}`;
export const ownerTextDefault = (k: OwnerTextKey) =>
  readFileSync(join(process.cwd(), "src/prompts/owner", OWNER_TEXTS[k].file), "utf8").trim();

export async function getOwnerTexts(db: DB): Promise<Record<OwnerTextKey, string>> {
  const keys = Object.keys(OWNER_TEXTS) as OwnerTextKey[];
  const rows = await db.select().from(setting).where(inArray(setting.key, keys.map(settingKey)));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, byKey.get(settingKey(k))?.trim() || ownerTextDefault(k)])) as Record<OwnerTextKey, string>;
}

export async function setOwnerText(db: DB, k: OwnerTextKey, value: string) {
  await db.insert(setting).values({ key: settingKey(k), value }).onConflictDoUpdate({ target: setting.key, set: { value, updatedAt: new Date() } });
}
