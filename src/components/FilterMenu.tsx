"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CompanyLogo } from "./CompanyLogo";

export interface FilterOption {
  value: string; label: string; count?: number; domain?: string; logoId?: number; canary?: boolean;
  /** Set by the page for a multi-select group: where a click goes, whether it is ticked, and a link that shows only this option. */
  href?: string; on?: boolean; only?: string;
}
/** A multi group keeps the menu open on each click, so several options can be ticked in a row. */
export interface FilterGroup { param: string; title?: string; options: FilterOption[]; multi?: boolean; top?: { label: string; href: string } }

/** A small dropdown that sets one query parameter per group and reloads the list. */
export function FilterMenu({ label, value, groups, dashed, clearParam, clearHref }: { label: string; value?: string; groups: FilterGroup[]; dashed?: boolean; clearParam?: string; clearHref?: string }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const href = (param: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null || p.get(param) === v) p.delete(param); else p.set(param, v);
    const q = p.toString();
    return q ? `${path}?${q}` : path;
  };
  const many = groups.reduce((n, g) => n + g.options.length, 0) > 7;

  return (
    <div className="fmenu" ref={ref}>
      <button type="button" className={`fb${value ? " on" : ""}${dashed ? " add" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {value ? <><span className="k">{label}</span>{value}</> : dashed ? <>+ {label}</> : <><span className="k">{label}</span>Any</>}
        {!dashed && <span className="caret">▾</span>}
      </button>
      {value && (clearHref || clearParam) && <a className="fb-x" href={clearHref ?? href(clearParam!, null)} aria-label={`Clear ${label}`}>✕</a>}
      {open && (
        <div className="menu" role="menu">
          {many && <input className="menu-find" autoFocus placeholder="Find…" value={find} onChange={(e) => setFind(e.target.value)} />}
          {groups.map((g) => (
            <div key={g.param + (g.title ?? "")}>
              {g.title && <div className="menu-hd">{g.title}</div>}
              {g.top && <Link className="menu-o menu-top" href={g.top.href} scroll={false}>{g.top.label}</Link>}
              {g.options.filter((o) => !find || o.label.toLowerCase().includes(find.toLowerCase())).map((o) => {
                const on = o.on ?? params.get(g.param) === o.value;
                const body = <>
                  {g.multi && <span className={`menu-cb${on ? " on" : ""}`} aria-hidden>{on ? "✓" : ""}</span>}
                  {o.domain !== undefined && <CompanyLogo id={o.logoId} name={o.label} domain={o.domain} size={18} canary={o.canary} />}
                  <span>{o.label}</span>
                  {g.multi ? o.count !== undefined && <span className="menu-n">{o.count}</span>
                    : on ? <span className="menu-n">✓</span> : o.count !== undefined && <span className="menu-n">{o.count}</span>}
                </>;
                if (g.multi) return (
                  <div key={o.value} className="menu-row">
                    <Link role="menuitemcheckbox" aria-checked={on} className="menu-o" href={o.href ?? href(g.param, o.value)} scroll={false}>{body}</Link>
                    {o.only && <Link className="menu-only" href={o.only} scroll={false} aria-label={`Only ${o.label}`}>Only</Link>}
                  </div>
                );
                return (
                  <a key={o.value} role="menuitemcheckbox" aria-checked={on} className={`menu-o${on ? " on" : ""}`} href={o.href ?? href(g.param, o.value)}>{body}</a>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
