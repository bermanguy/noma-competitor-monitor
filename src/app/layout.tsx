import "./globals.css";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ViewAsBar } from "@/components/ViewAsBar";
import { VIEW_AS_COOKIE, toRole } from "@/lib/view-as";

export const metadata = { title: "Competitor monitor" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const role = toRole((await cookies()).get(VIEW_AS_COOKIE)?.value);
  return (
    <html lang="en">
      <body>
        <ViewAsBar role={role} />
        <header className="top">
          <strong>Competitor monitor</strong>
          <a href="/">What we found</a>
          <a href="/settings">Competitors and topics</a>
          {role === "builder" && <a href="/ops" style={{ marginLeft: "auto" }}>Builder area</a>}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
