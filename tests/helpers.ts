import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import type { DB } from "../src/db/client";

/** A fresh in-memory Postgres with all migrations applied. */
export async function testDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as DB;
}
