import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE, isBuilderPath, viewerFor } from "@/lib/view-as";

/** Switches who the site is viewed as, then returns to the page (or home, if that viewer can't see it). */
export function GET(req: NextRequest) {
  const v = viewerFor(req.nextUrl.searchParams.get("as"));
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const target = v.role === "owner" && isBuilderPath(safe) ? "/" : safe;
  // A relative Location: behind Render's proxy, req.url is the internal address (localhost:10000).
  const res = new NextResponse(null, { status: 303, headers: { Location: target } });
  res.cookies.set(VIEW_AS_COOKIE, v.key, { path: "/", httpOnly: true, sameSite: "lax", secure: req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
