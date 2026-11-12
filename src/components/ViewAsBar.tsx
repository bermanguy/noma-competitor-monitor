"use client";
import { usePathname } from "next/navigation";
import { VIEWERS } from "@/lib/view-as";

export function ViewAsBar({ current }: { current: string }) {
  const path = usePathname();
  // Public pages (the canary, a team member's feedback link) are not part of the site's roles.
  if (path.startsWith("/feedback") || path.startsWith("/canary")) return null;
  return (
    <div className="viewas">
      <span aria-hidden>👁</span>
      <span>You are viewing as</span>
      <select
        aria-label="View as"
        value={current}
        onChange={(e) => { window.location.href = `/view-as?as=${e.target.value}&next=${encodeURIComponent(path)}`; }}
      >
        {VIEWERS.map((v) => <option key={v.key} value={v.key}>{v.name} ({v.title})</option>)}
      </select>
      <span className="viewas-note">Business teams get everything in Slack.</span>
    </div>
  );
}
