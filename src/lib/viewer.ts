import { cookies } from "next/headers";
import { VIEW_AS_COOKIE, viewerFor } from "./view-as";

/** Who the current request is viewing as (server side). */
export async function currentViewer() {
  return viewerFor((await cookies()).get(VIEW_AS_COOKIE)?.value);
}
