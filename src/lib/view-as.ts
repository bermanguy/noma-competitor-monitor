/**
 * "View as": the site has no user accounts yet, so whoever is signed in picks who they are viewing
 * as, like an admin viewing a product as another user. Business teams are not here: they use Slack.
 *
 * - The builder sees and does everything, including the builder area.
 * - Each owner owns one team: they see the feed and settings, edit their own team's description and
 *   review their own team's votes. Shared settings (competitors, topics, what Noma sells) are open to every owner.
 */
export const VIEW_AS_COOKIE = "view_as";

export interface Viewer { key: string; name: string; title: string; role: "builder" | "owner"; team: string | null }

export const VIEWERS: Viewer[] = [
  { key: "builder", name: "Guy", title: "Builder", role: "builder", team: null },
  { key: "marketing", name: "Maya", title: "Head of Marketing", role: "owner", team: "marketing" },
  { key: "product", name: "Daniel", title: "Head of Product", role: "owner", team: "product" },
  { key: "rnd", name: "Noa", title: "VP R&D", role: "owner", team: "rnd" },
];

export function viewerFor(key: string | undefined | null): Viewer {
  return VIEWERS.find((v) => v.key === key) ?? VIEWERS[0]!;
}

/** Can this viewer change this team's description and review its votes? */
export const canEditTeam = (v: Viewer, teamKey: string) => v.role === "builder" || v.team === teamKey;

/** Pages only the builder sees. */
export const isBuilderPath = (path: string) => path === "/ops" || path.startsWith("/ops/");
