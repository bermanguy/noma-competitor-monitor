import "./globals.css";
import type { ReactNode } from "react";
import { ViewAsBar } from "@/components/ViewAsBar";
import { currentViewer } from "@/lib/viewer";

export const metadata = { title: "Competitor monitor" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await currentViewer();
  return (
    <html lang="en">
      <body>
        <ViewAsBar current={viewer.key} />
        <header className="top">
          <a href="/" className="brand"><img src="/logo.png" alt="" width={32} height={32} /><strong>Competitor monitor</strong></a>
          <a href="/">What we found</a>
          <a href="/settings">Competitors and topics</a>
          {viewer.role === "builder" && <a href="/ops" style={{ marginLeft: "auto" }}>Builder area</a>}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
