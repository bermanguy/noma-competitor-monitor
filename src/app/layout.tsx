import "./globals.css";
import type { ReactNode } from "react";
import { eq, inArray, sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { currentViewer } from "@/lib/viewer";
import { canEditTeam, type Viewer } from "@/lib/view-as";
import type { BadgeKey } from "@/lib/nav";
import { db } from "@/db/client";
import { item, ownerSuggestion } from "@/db/schema";
import { toReview } from "@/eval/owner-golden";

export const metadata = { title: "Competitor monitor" };

/** The counts on the rail and sub-menus. A badge is a hint, so a failed count never breaks a page. */
async function badgeCounts(viewer: Viewer): Promise<Partial<Record<BadgeKey, number>>> {
  try {
    const d = db();
    const review = (await toReview(d)).filter((r) => r.votes.some((v) => canEditTeam(viewer, v.team))).length;
    const [s] = await d.select({ n: sql<number>`count(*)` }).from(ownerSuggestion).where(eq(ownerSuggestion.status, "pending"));
    const [e] = viewer.role === "builder"
      ? await d.select({ n: sql<number>`count(*)` }).from(item).where(inArray(item.status, ["held", "failed"]))
      : [{ n: 0 }];
    return { review, suggestions: Number(s?.n ?? 0), errors: Number(e?.n ?? 0) };
  } catch {
    return {};
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await currentViewer();
  const counts = await badgeCounts(viewer);
  return (
    <html lang="en">
      <body>
        <AppShell viewer={viewer} counts={counts}>{children}</AppShell>
      </body>
    </html>
  );
}
