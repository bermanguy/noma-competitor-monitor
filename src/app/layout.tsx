import "./globals.css";
import type { ReactNode } from "react";
import { TopNav } from "./_ui/nav";

export const metadata = { title: "Competitor monitor" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
