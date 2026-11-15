import { and, eq, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import { item, source } from "../db/schema";
import { extractMain, isGenericTitle } from "./extract";
import { fetchSource } from "./fetch";

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const CARD_PREFIX = new RegExp(`^(Blog|News|Press|Research|Article|Post|Insights?)s?\\s*(${MONTHS})\\b`, "i");

/**
 * A title that is really a listing card's whole text: the category and date glued to the title and teaser,
 * e.g. "BlogNovember 9, 2026Runtime Security…See how…". Posts found before listing titles were fixed kept these.
 */
export const looksLikeCardText = (t: string | null | undefined) => !!t && (CARD_PREFIX.test(t.trim()) || t.length > 160);

/** Re-reads the post's own title for a few such posts per run. Never fails the run; a fetch that fails is tried next run. */
export async function repairCardTitles(db: DB, limit = 5): Promise<number> {
  const posts = await db.select({ id: item.id, url: item.url, title: item.title, fetchMode: source.fetchMode })
    .from(item).innerJoin(source, eq(item.sourceId, source.id))
    .where(and(eq(item.kind, "post"), ne(item.status, "baseline")));
  let fixed = 0;
  for (const p of posts.filter((x) => looksLikeCardText(x.title)).slice(0, limit)) {
    try {
      const page = await fetchSource(p.url, p.fetchMode);
      if (!page.ok) continue;
      const title = extractMain(page.body, page.url).title?.trim();
      if (!title || isGenericTitle(title) || looksLikeCardText(title) || title === p.title) continue;
      await db.update(item).set({ title }).where(eq(item.id, p.id));
      console.log(`title fixed for item ${p.id}: "${title}"`);
      fixed++;
    } catch (e) {
      console.error(`title repair failed for item ${p.id}: ${(e as Error).message}`);
    }
  }
  return fixed;
}
