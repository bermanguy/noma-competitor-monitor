import { db } from "@/db/client";
import { exportGolden } from "@/eval/export";

export const dynamic = "force-dynamic";

/** Operator-only (under /ops): the latest judged items as unlabelled exam items, for the golden set. */
export async function GET(req: Request) {
  const latest = Math.min(Number(new URL(req.url).searchParams.get("latest") ?? 30) || 30, 200);
  const items = await exportGolden(db(), { latest });
  return new Response(JSON.stringify(items, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="golden-candidates-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
