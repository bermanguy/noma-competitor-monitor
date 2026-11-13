import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { competitor, source, type PageType, type SourceKind } from "@/db/schema";

/** "https://www.Example.com/blog" -> "example.com". Returns null when it isn't a plain domain. */
export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : null;
}

/** What createCompetitor needs from a discovered source. Extra fields (sample, role, checked) are ignored. */
export interface NewSource { kind: SourceKind; url: string; label: string; linkPrefix?: string; pageType?: PageType }

export type CreateResult =
  | { ok: true; competitor: typeof competitor.$inferSelect; restored: boolean; sourceIds: number[] }
  | { ok: false; error: string };

/**
 * Adds a competitor and the sources discovery found. Shared by Settings, the add wizard and the Claude
 * connector, so all of them apply the same rules. A competitor that was removed earlier comes back with
 * its history instead of failing on the unique domain. Returns the ids of the sources it inserted.
 */
export async function createCompetitor(
  d: DB,
  input: { name: string; domain: string; sources: NewSource[]; addedBy: string },
): Promise<CreateResult> {
  const name = input.name.trim();
  const domain = normalizeDomain(input.domain);
  if (!name || !domain) return { ok: false, error: "Enter a name and a website like example.com" };
  const [existing] = await d.select().from(competitor).where(eq(competitor.domain, domain));
  if (existing && !existing.archivedAt) return { ok: false, error: `${existing.name} is already watched` };

  const [c] = existing
    ? await d.update(competitor).set({ archivedAt: null, active: true, name }).where(eq(competitor.id, existing.id)).returning()
    : await d.insert(competitor).values({ name, domain, addedBy: input.addedBy }).returning();
  const sourceIds: number[] = [];
  for (const s of input.sources) {
    const r = await d.insert(source)
      .values({ competitorId: c!.id, kind: s.kind, url: s.url, label: s.label, linkPrefix: s.linkPrefix, pageType: s.pageType ?? "general" })
      .onConflictDoNothing().returning({ id: source.id });
    sourceIds.push(...r.map((x) => x.id));
  }
  return { ok: true, competitor: c!, restored: !!existing, sourceIds };
}

/** Removes a competitor from view and from checking, or brings it back. Its history always stays. */
export async function archiveCompetitor(d: DB, id: number, archived: boolean) {
  await d.update(competitor).set(archived ? { archivedAt: new Date(), active: false } : { archivedAt: null, active: true }).where(eq(competitor.id, id));
}
