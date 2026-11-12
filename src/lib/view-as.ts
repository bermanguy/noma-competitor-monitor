/**
 * "View as": the site has no user accounts yet, so whoever is signed in picks which role they see,
 * like an admin viewing a product as another user. Business teams have no role here: they use Slack.
 */
export const VIEW_AS_COOKIE = "view_as";
export const ROLES = {
  owner: { label: "Owner", hint: "decides what each team gets" },
  builder: { label: "Builder", hint: "runs and improves the system" },
} as const;
export type Role = keyof typeof ROLES;

export function toRole(v: string | undefined | null): Role {
  return v === "builder" ? "builder" : "owner";
}

/** Pages only the builder sees. */
export const isBuilderPath = (path: string) => path === "/ops" || path.startsWith("/ops/");
