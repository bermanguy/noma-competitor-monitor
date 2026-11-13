import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitorLogo } from "@/db/schema";

export const dynamic = "force-dynamic";

/** A competitor's kept logo. 404 when there is none, so the page falls back to the site icon or a letter tile. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("not found", { status: 404 });
  const [logo] = await db().select().from(competitorLogo).where(eq(competitorLogo.competitorId, id));
  if (!logo) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(Buffer.from(logo.data, "base64"), {
    headers: { "content-type": logo.contentType, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
