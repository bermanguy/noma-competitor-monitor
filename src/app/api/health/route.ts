import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { run } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Public liveness: the web app is up and the last scheduled run is recent. No details leak. */
export async function GET() {
  try {
    const [last] = await db().select().from(run).orderBy(desc(run.id)).limit(1);
    const stale = !last || Date.now() - last.startedAt.getTime() > 4 * 3600e3;
    return Response.json({ status: stale ? "stale" : "ok" }, { status: stale ? 503 : 200 });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
