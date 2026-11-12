"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Inbox", match: (p: string) => p === "/" },
  { href: "/teams", label: "Teams", match: (p: string) => p.startsWith("/teams") },
  { href: "/feed", label: "What we found", match: (p: string) => p.startsWith("/feed") },
  { href: "/competitors", label: "Competitors", match: (p: string) => p.startsWith("/competitors") },
  { href: "/topics", label: "Topics", match: (p: string) => p.startsWith("/topics") },
  { href: "/settings", label: "Noma and levels", match: (p: string) => p.startsWith("/settings") },
];

export function TopNav() {
  const path = usePathname() ?? "/";
  // The canary pages are monitored like a competitor's page. Their header text is part of what the
  // pipeline compares, so it stays exactly as it was; a new nav there would read as a page change.
  if (path.startsWith("/canary")) {
    return (
      <header className="top" style={{ gap: 24, padding: "12px 24px" }}>
        <strong>Competitor monitor</strong>
        <a href="/">What we found</a>
        <a href="/settings">Competitors and topics</a>
        <a href="/ops" style={{ marginLeft: "auto" }}>Operator</a>
      </header>
    );
  }
  // People who open a feedback or question link from Slack only need the card, not the owner menu.
  if (path.startsWith("/feedback") || path.startsWith("/ask")) {
    return <header className="top"><span className="brand"><i />Competitor monitor</span></header>;
  }
  const ops = path.startsWith("/ops");
  return (
    <header className="top">
      <a href="/" className="brand"><i />Competitor monitor</a>
      <nav>
        {ops
          ? <a href="/ops" className="on">Operator</a>
          : LINKS.map((l) => <a key={l.href} href={l.href} className={l.match(path) ? "on" : ""}>{l.label}</a>)}
      </nav>
      <a className="ops" href={ops ? "/" : "/ops"}>{ops ? "Owner view" : "Operator"}</a>
    </header>
  );
}
