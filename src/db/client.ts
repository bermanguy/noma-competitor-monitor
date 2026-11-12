import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = ReturnType<typeof makeDb>;

export function makeDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql, { schema });
}

let shared: DB | undefined;
/** One pool per process. */
export function db(): DB {
  shared ??= makeDb();
  return shared;
}
