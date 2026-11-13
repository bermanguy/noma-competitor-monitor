import { serveMcp } from "@/mcp/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** The Claude connector, with the person's token in the URL (claude.ai custom connectors take only a URL). */
export const POST = async (req: Request, { params }: Ctx) => serveMcp(req, (await params).token);
export const GET = async (req: Request, { params }: Ctx) => serveMcp(req, (await params).token);
export const DELETE = async (req: Request, { params }: Ctx) => serveMcp(req, (await params).token);
