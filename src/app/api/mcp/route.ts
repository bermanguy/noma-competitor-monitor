import { serveMcp } from "@/mcp/http";

export const dynamic = "force-dynamic";

/** The Claude connector, with the token in an Authorization: Bearer header. */
export const POST = (req: Request) => serveMcp(req);
export const GET = (req: Request) => serveMcp(req);
export const DELETE = (req: Request) => serveMcp(req);
