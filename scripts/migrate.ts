import { migrate } from "drizzle-orm/postgres-js/migrator";
import { makeDb } from "../src/db/client";

const db = makeDb();
await migrate(db, { migrationsFolder: "drizzle" });
console.log("migrations applied");
process.exit(0);
