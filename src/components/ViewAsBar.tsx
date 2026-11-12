"use client";
import { usePathname } from "next/navigation";
import { ROLES, type Role } from "@/lib/view-as";

export function ViewAsBar({ role }: { role: Role }) {
  const path = usePathname();
  // Public pages (the canary, a team member's feedback link) are not part of the site's roles.
  if (path.startsWith("/feedback") || path.startsWith("/canary")) return null;
  return (
    <div className="viewas">
      <span>You are viewing as</span>
      <select
        aria-label="View as"
        value={role}
        onChange={(e) => { window.location.href = `/view-as?role=${e.target.value}&next=${encodeURIComponent(path)}`; }}
      >
        {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r].label}: {ROLES[r].hint}</option>)}
      </select>
      <span className="viewas-note">Business teams get everything in Slack.</span>
    </div>
  );
}
