"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CompanyLogo } from "./CompanyLogo";

export interface FilterOption { value: string; label: string; count?: number; domain?: string; logoId?: number; canary?: boolean }
export interface FilterGroup { param: string; title?: string; options: FilterOption[] }

/** A small dropdown that sets one query parameter per group and reloads the list. */
export function FilterMenu({ label, value, groups, dashed, clearParam }: { label: string; value?: string; groups: FilterGroup[]; dashed?: boolean; clearParam?: string }) {
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
      {value && clearParam && <a className="fb-x" href={href(clearParam, null)} aria-label={`Clear ${label}`}>✕</a>}
      {open && (
        <div className="menu" role="menu">
          {many && <input className="menu-find" autoFocus placeholder="Find…" value={find} onChange={(e) => setFind(e.target.value)} />}
          {groups.map((g) => (
            <div key={g.param + (g.title ?? "")}>
              {g.title && <div className="menu-hd">{g.title}</div>}
              {g.options.filter((o) => !find || o.label.toLowerCase().includes(find.toLowerCase())).map((o) => {
                const on = params.get(g.param) === o.value;
                return (
                  <a key={o.value} role="menuitemcheckbox" aria-checked={on} className={`menu-o${on ? " on" : ""}`} href={href(g.param, o.value)}>
                    {o.domain !== undefined && <CompanyLogo id={o.logoId} name={o.label} domain={o.domain} size={18} canary={o.canary} />}
                    <span>{o.label}</span>
                    {on ? <span className="menu-n">✓</span> : o.count !== undefined && <span className="menu-n">{o.count}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
