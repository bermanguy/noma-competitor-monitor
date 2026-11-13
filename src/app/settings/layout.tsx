import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/viewer";

/** Setup is for owners and the builder. A member sees only the Changes feed. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  if ((await currentViewer()).role === "member") redirect("/");
  return children;
}
