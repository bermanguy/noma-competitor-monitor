import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE, isBuilderPath, viewerFor } from "@/lib/view-as";

/**
 * Two surfaces, two passwords. The owner password opens the owner surface (feed, settings); the
 * builder password (OPS_PASSWORD) opens everything. Which role the pages show is picked with "View as". Both use one sign-in realm, so whoever signs in once can move
 * between the pages without being asked again. The canary page, feedback links and the health check are public.
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ops = path.startsWith("/ops");
  const allowed = ops ? [process.env.OPS_PASSWORD] : [process.env.OWNER_PASSWORD, process.env.OPS_PASSWORD];
  if (allowed.every((p) => !p)) return viewAs(req); // local development without passwords
  const header = req.headers.get("authorization") ?? "";
  const [, encoded] = header.split(" ");
  const pass = encoded ? atob(encoded).split(":").slice(1).join(":") : "";
  if (pass && allowed.includes(pass)) return viewAs(req);
  return new NextResponse("Sign in required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Competitor monitor"' },
  });
}

/** The builder area is shown only when viewing as the builder; opening it switches the view to the builder. */
function viewAs(req: NextRequest) {
  if (isBuilderPath(req.nextUrl.pathname) && viewerFor(req.cookies.get(VIEW_AS_COOKIE)?.value).role !== "builder") {
    // Built from the public host: behind Render's proxy, req.url is the internal address (localhost:10000).
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    return NextResponse.redirect(`${proto}://${host}/view-as?as=builder&next=${encodeURIComponent(req.nextUrl.pathname)}`, 303);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|canary|feedback|api/health|favicon|icon|logo\.png).*)"],
};
