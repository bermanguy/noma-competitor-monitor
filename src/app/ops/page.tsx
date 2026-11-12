import { redirect } from "next/navigation";

/** The Builder area opens on Runs; each part has its own page. */
export default function OpsHome() {
  redirect("/ops/runs");
}
