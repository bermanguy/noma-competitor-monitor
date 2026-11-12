import { db } from "../src/db/client";
import { seed } from "../src/db/seed";
import { config } from "../src/config";

await seed(db(), config.publicUrl);
console.log("seeded");
process.exit(0);
