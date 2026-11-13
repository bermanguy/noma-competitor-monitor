import { redirect } from "next/navigation";

/** The Builder area opens on the Overview; each part has its own page. */
export default function OpsHome() {
  redirect("/ops/overview");
}
