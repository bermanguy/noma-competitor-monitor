import { db } from "../src/db/client";
import { runPipeline } from "../src/pipeline/run";

const trigger = process.argv[2] ?? "schedule";
const result = await runPipeline(db(), trigger);
process.exit(result && result.status === "failed" ? 1 : 0);
