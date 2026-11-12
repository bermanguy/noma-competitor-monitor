import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Competitor monitor" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <strong>Competitor monitor</strong>
          <span className="muted">Owner:</span>
          <a href="/">What we found</a>
          <a href="/settings">Competitors and topics</a>
          <span className="muted" style={{ marginLeft: "auto" }}>Builder:</span>
          <a href="/ops">Operator</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
