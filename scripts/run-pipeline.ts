import { db } from "../src/db/client";
import { runPipeline } from "../src/pipeline/run";
import { shouldRunNow } from "../src/pipeline/schedule";

const trigger = process.argv[2] ?? "schedule";
if (trigger === "schedule" && !(await shouldRunNow(db()))) {
  console.log("not a run hour in the business time zone; exiting");
  process.exit(0);
}
const result = await runPipeline(db(), trigger);
process.exit(result && result.status === "failed" ? 1 : 0);
