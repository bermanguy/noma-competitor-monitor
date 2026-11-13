"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RAIL, locate, subHref, type BadgeKey, type RailKey } from "@/lib/nav";
import { ROLE_NAME, type Role, type Viewer } from "@/lib/view-as";

const PATHS: Record<string, string> = {
  changes: "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5",
  setup: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4",
  builder: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  review: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  hash: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
  prompt: "M4 5h16v11H8l-4 4z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7",
  dot: "M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0",
};
const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden><path d={PATHS[name] ?? PATHS.dot} /></svg>
);

/** One color per team, so a team's owner and members read as one group. */
const AVATAR: Record<string, string> = { builder: "#55e0ff", marketing: "#fbbf77", product: "#a7f3a0", rnd: "#f5a8d4" };
const TEAM_NAME: Record<string, string> = { marketing: "Marketing", product: "Product", rnd: "R&D" };
const Avatar = ({ v, size = 38 }: { v: Viewer; size?: number }) => (
  <span className="avatar" style={{ background: AVATAR[v.team ?? v.key] ?? "#ddd", width: size, height: size, fontSize: size * 0.4 }}>{v.name[0]}</span>
);
const roleLine = (v: Viewer) => (v.team ? `${ROLE_NAME[v.role]} · ${TEAM_NAME[v.team] ?? v.team}` : ROLE_NAME[v.role]);
const GROUPS: { role: Role; label: string }[] = [{ role: "builder", label: "Builder" }, { role: "owner", label: "Owners" }, { role: "member", label: "Members" }];

export function AppShell({ viewer, viewers, counts, children }: { viewer: Viewer; viewers: Viewer[]; counts: Partial<Record<BadgeKey, number>>; children: ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  // Public pages (the canary, a team member's feedback link) are not part of the app.
  if (path.startsWith("/feedback") || path.startsWith("/canary")) return <main className="plain">{children}</main>;

  const { rail, sub } = locate(path);
  // A member sees only Changes; an owner sees everything but Builder.
  const items = RAIL.filter((r) => viewer.role === "builder" || (viewer.role === "owner" ? !r.builderOnly : r.key === "changes"));
  const railBadge = (k: RailKey) => RAIL.find((r) => r.key === k)!.groups.flatMap((g) => g.items).reduce((n, i) => n + (i.badge ? counts[i.badge] ?? 0 : 0), 0);
  const hasPanel = !!rail && rail.groups.length > 0;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <a href="/" className="rail-logo" title="Competitor monitor"><img src="/logo.png" alt="Competitor monitor" width={40} height={40} /></a>
        {items.map((r) => {
          const n = railBadge(r.key);
          return (
            <a key={r.key} href={r.href} className={`rail-item${rail?.key === r.key ? " on" : ""}`} aria-current={rail?.key === r.key ? "page" : undefined}>
              <span className="rail-icon"><Icon name={r.key} />{n > 0 && <span className="rail-badge">{n}</span>}</span>
              {r.label}
            </a>
          );
        })}
        <div className="rail-spacer" />
        <div className="rail-user" ref={menuRef}>
          <button type="button" className={`rail-item${menu ? " on" : ""}`} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            <span className="rail-avatar"><Avatar v={viewer} /><span className="online" /></span>
            {viewer.name}
          </button>
          {menu && (
            <div className="user-menu" role="menu">
              <div className="user-me"><Avatar v={viewer} /><div><strong>{viewer.name}</strong><div className="muted">{viewer.title}</div><div className="role-line">{roleLine(viewer)}</div></div></div>
              <div className="user-scroll">
                {GROUPS.map((g) => {
                  const list = viewers.filter((v) => v.role === g.role);
                  if (!list.length) return null;
                  return (
                    <div key={g.role}>
                      <div className="user-label">View as {g.label.toLowerCase()}</div>
                      {list.map((v) => (
                        <a key={v.key} role="menuitemradio" aria-checked={v.key === viewer.key} className={`user-opt${v.key === viewer.key ? " on" : ""}`}
                          href={`/view-as?as=${v.key}&next=${encodeURIComponent(path)}`}>
                          <Avatar v={v} size={28} /><span><strong>{v.name}</strong> <span className="muted">{v.title}</span></span>
                          {v.team && <span className="team-chip">{TEAM_NAME[v.team] ?? v.team}</span>}
                          {v.key === viewer.key && <span className="check">✓</span>}
                        </a>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="user-foot">Builder sees everything. Owners set up their own team. Members read their team&apos;s changes, and get them in Slack.</div>
            </div>
          )}
        </div>
      </nav>

      {hasPanel && (
        <aside className="subnav" aria-label={rail!.label}>
          <h2>{rail!.label}</h2>
          {rail!.groups.map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="subnav-group">{g.label}</div>}
              {g.items.map((i) => {
                const n = i.badge ? counts[i.badge] ?? 0 : 0;
                return (
                  <a key={i.key} href={subHref(rail!.key, i.key)} className={`subnav-item${sub?.key === i.key ? " on" : ""}`} aria-current={sub?.key === i.key ? "page" : undefined}>
                    <Icon name={i.icon ?? "dot"} />
                    <span>{i.label}</span>
                    {n > 0 && <span className="count">{n}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </aside>
      )}

      <section className={`content${hasPanel ? "" : " full"}`}>
        <div className="topbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            {rail && (sub ? <><a href={rail.href}>{rail.label}</a><span className="sep">/</span><strong>{sub.label}</strong></> : <strong>{rail.label}</strong>)}
          </nav>
          <button type="button" className="viewing" onClick={() => setMenu(true)} title="Change who you are viewing as">
            <Avatar v={viewer} size={22} />Viewing as {viewer.name} · {roleLine(viewer)}
          </button>
        </div>
        <main>{children}</main>
      </section>
    </div>
  );
}
