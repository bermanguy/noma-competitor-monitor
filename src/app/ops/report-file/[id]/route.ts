import { db } from "@/db/client";
import { reportFile } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** Builder-only (under /ops): a report's screenshot or video. Answers byte ranges so Safari can play the video. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const file = await reportFile(db(), Number((await params).id));
  if (!file) return new Response("Not found", { status: 404 });
  const data = new Uint8Array(file.data);
  const size = data.byteLength;
  const headers: Record<string, string> = {
    "content-type": file.type,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "content-disposition": `inline; filename="${file.name.replace(/[^\w.\- ]/g, "_")}"`,
    "x-content-type-options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(data.slice(start, end + 1), {
      status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(data, { headers: { ...headers, "content-length": String(size) } });
}
