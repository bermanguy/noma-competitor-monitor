import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { setting } from "@/db/schema";
import { DEFAULT_CANARY } from "@/lib/canary";

export const dynamic = "force-dynamic";



/** A page we control, monitored like a competitor page, for end-to-end checks and the demo. */
export default async function Canary() {
  const [row] = await db().select().from(setting).where(eq(setting.key, "canary"));
  const lines = (row?.value || DEFAULT_CANARY).split("\n").filter(Boolean);
  return (
    <article style={{ background: "#fff", padding: 24, borderRadius: 10 }}>
      <h1>{lines[0]}</h1>
      {lines.slice(1).map((l, i) => <p key={i}>{l}</p>)}
      <p className="muted">This page exists to test the competitor monitor. It is not a real company.</p>
    </article>
  );
}
