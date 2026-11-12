import { db } from "../src/db/client";
import { runPipeline } from "../src/pipeline/run";

const result = await runPipeline(db(), process.argv[2] ?? "schedule");
process.exit(result && result.status === "failed" ? 1 : 0);
