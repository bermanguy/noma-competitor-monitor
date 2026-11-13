import { cookies } from "next/headers";
import { asc, isNull } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db/client";
import { person, type PersonRole } from "@/db/schema";
import { BUILDER, VIEW_AS_COOKIE, type Viewer } from "./view-as";

type PersonRow = typeof person.$inferSelect;
export const toViewer = (p: Pick<PersonRow, "key" | "name" | "title" | "role" | "teamKey">): Viewer =>
  ({ key: p.key, name: p.name, title: p.title, role: p.role as PersonRole, team: p.teamKey });

/** Everyone the site can be viewed as: the builder, then each team's owners and members. */
export async function allViewers(d: DB = defaultDb()): Promise<Viewer[]> {
  try {
    const rows = await d.select().from(person).where(isNull(person.removedAt)).orderBy(asc(person.id));
    return [BUILDER, ...rows.map(toViewer)];
  } catch {
    return [BUILDER];
  }
}

export async function viewerFor(key: string | undefined | null, d?: DB): Promise<Viewer> {
  if (!key || key === BUILDER.key) return BUILDER;
  return (await allViewers(d)).find((v) => v.key === key) ?? BUILDER;
}

/** Who the current request is viewing as (server side). Someone who was removed falls back to the builder. */
export async function currentViewer() {
  return viewerFor((await cookies()).get(VIEW_AS_COOKIE)?.value);
}
