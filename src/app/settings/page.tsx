import { redirect } from "next/navigation";

/** Setup opens on Competitors; each part of Setup has its own page. */
export default function SettingsHome() {
  redirect("/settings/competitors");
}
