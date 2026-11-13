/**
 * "View as": the site has no sign-in per person yet, so whoever is signed in picks who they are
 * viewing as, like an admin viewing a product as another user.
 *
 * Three roles:
 * - The builder sees and does everything, including the builder area. There is one, and it is fixed.
 * - An owner owns one team. They see the feed and Setup, edit their own team's description, review
 *   their own team's votes, add and remove people in their own team, and preview their team's next
 *   digest. Shared settings (competitors, topics, what Noma sells) are open to every owner.
 * - A member belongs to one team and sees only the Changes feed, with only their team's message.
 *   Slack stays their main place; the feed is where they catch up.
 *
 * Owners and members live in the person table, so an owner can add someone and view as them at once.
 */
export const VIEW_AS_COOKIE = "view_as";

export type Role = "builder" | "owner" | "member";
export interface Viewer { key: string; name: string; title: string; role: Role; team: string | null }

export const BUILDER: Viewer = { key: "builder", name: "Guy", title: "Builder", role: "builder", team: null };

export const ROLE_NAME: Record<Role, string> = { builder: "Builder", owner: "Owner", member: "Member" };
export const ROLE_HINT: Record<Role, string> = {
  builder: "Everything, including runs, sources and the exam",
  owner: "Sets up their team, adds people to it, and previews its digest",
  member: "Reads their team's changes. Gets them in Slack",
};

/** Can this viewer change this team's description, review its votes and preview its digest? */
export const canEditTeam = (v: Viewer, teamKey: string) => v.role === "builder" || (v.role === "owner" && v.team === teamKey);

/** Can this viewer add or remove owners and members in this team? */
export const canManagePeople = (v: Viewer, teamKey: string) => canEditTeam(v, teamKey);

/** Pages only the builder sees. */
export const isBuilderPath = (path: string) => path === "/ops" || path.startsWith("/ops/");

/** A member sees only the Changes feed. */
export const memberCanSee = (path: string) => path === "/" || path.startsWith("/?");

/** Where this viewer lands if they open a page they can't see. */
export function allowedPath(v: Viewer, path: string): string {
  if (v.role === "member" && !memberCanSee(path)) return "/";
  if (v.role !== "builder" && isBuilderPath(path)) return "/";
  return path;
}
