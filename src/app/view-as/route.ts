import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE, isBuilderPath, toRole } from "@/lib/view-as";

/** Switches the role the site is viewed as, then returns to the page (or home, if that role can't see it). */
export function GET(req: NextRequest) {
  const role = toRole(req.nextUrl.searchParams.get("role"));
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const target = role === "owner" && isBuilderPath(safe) ? "/" : safe;
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set(VIEW_AS_COOKIE, role, { path: "/", httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
