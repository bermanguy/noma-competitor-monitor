import { db } from "@/db/client";
import { currentViewer } from "@/lib/viewer";
import { createReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * The "Report a problem" dialog posts here, from any page and any role. The sign-in is checked by the
 * proxy like every app page. Who reported it is whoever the page is viewed as.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const f = form.get("file");
    const file = f instanceof File && f.size > 0 ? f : null;
    const page = String(form.get("page") ?? "/");
    const { id, slack } = await createReport(db(), {
      description: String(form.get("description") ?? ""),
      page: page.startsWith("/") ? page : "/",
      viewer: await currentViewer(),
      userAgent: req.headers.get("user-agent"),
      file: file && { name: file.name, type: file.type, size: file.size, data: new Uint8Array(await file.arrayBuffer()) },
    });
    return Response.json({ id, slack });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
