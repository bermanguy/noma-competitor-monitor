import { NextResponse, type NextRequest } from "next/server";

/**
 * Two surfaces, two passwords. The owner surface (feed, settings) and the operator surface (/ops)
 * are separated at the edge. The canary page, feedback links and the health check are public.
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ops = path.startsWith("/ops");
  const allowed = ops ? [process.env.OPS_PASSWORD] : [process.env.OWNER_PASSWORD, process.env.OPS_PASSWORD];
  if (allowed.every((p) => !p)) return NextResponse.next(); // local development without passwords
  const header = req.headers.get("authorization") ?? "";
  const [, encoded] = header.split(" ");
  const pass = encoded ? atob(encoded).split(":").slice(1).join(":") : "";
  if (pass && allowed.includes(pass)) return NextResponse.next();
  return new NextResponse("Sign in required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${ops ? "Operator" : "Competitor monitor"}"` },
  });
}

export const config = {
  matcher: ["/((?!_next|canary|feedback|api/health|favicon).*)"],
};
