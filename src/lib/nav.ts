/**
 * The app's navigation, shared by the left rail, the sub-menus, the breadcrumbs and the page titles,
 * so each page is named once. Owners never get the Builder item; the proxy also keeps them out of /ops.
 */
export type RailKey = "changes" | "setup" | "builder";
export type BadgeKey = "review" | "suggestions" | "errors";

export interface SubItem { key: string; label: string; icon?: string; badge?: BadgeKey }
export interface SubGroup { label?: string; items: SubItem[] }
export interface RailItem { key: RailKey; label: string; href: string; builderOnly?: boolean; groups: SubGroup[] }

export const SETTINGS_SECTIONS = ["review", "competitors", "topics", "company", "levels", "pricing", "teams", "suggestions"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const OPS_SECTIONS = ["runs", "sources", "errors", "exam", "quality", "spend", "canary"] as const;
export type OpsSection = (typeof OPS_SECTIONS)[number];

export const RAIL: RailItem[] = [
  { key: "changes", label: "Changes", href: "/", groups: [] },
  {
    key: "setup", label: "Setup", href: "/settings/competitors",
    groups: [
      { items: [{ key: "review", label: "To review", icon: "review", badge: "review" }] },
      { label: "What we watch", items: [{ key: "competitors", label: "Competitors", icon: "building" }, { key: "topics", label: "Topics", icon: "hash" }] },
      {
        label: "Prompts",
        items: [
          { key: "company", label: "What Noma sells", icon: "prompt" },
          { key: "levels", label: "What the levels mean", icon: "prompt" },
          { key: "pricing", label: "What matters on pricing", icon: "prompt" },
          { key: "teams", label: "What each team cares about", icon: "prompt" },
          { key: "suggestions", label: "Suggested from our site", icon: "spark", badge: "suggestions" },
        ],
      },
    ],
  },
  {
    key: "builder", label: "Builder", href: "/ops/runs", builderOnly: true,
    groups: [
      { items: [{ key: "runs", label: "Runs" }, { key: "sources", label: "Sources" }, { key: "errors", label: "Not sent (errors)", badge: "errors" }] },
      { label: "Quality", items: [{ key: "exam", label: "Exam (golden set)" }, { key: "quality", label: "Output quality" }, { key: "spend", label: "Model spend" }] },
      { label: "Testing", items: [{ key: "canary", label: "Canary pages" }] },
    ],
  },
];

const BASE: Record<RailKey, string> = { changes: "/", setup: "/settings", builder: "/ops" };
export const subHref = (rail: RailKey, sub: string) => `${BASE[rail]}/${sub}`;

/** Which rail item and sub-menu item a path belongs to. */
export function locate(path: string): { rail: RailItem | undefined; sub: SubItem | undefined } {
  const [, first, second] = path.split("/");
  const rail = first === "settings" ? RAIL[1] : first === "ops" ? RAIL[2] : first === "" ? RAIL[0] : undefined;
  const sub = rail?.groups.flatMap((g) => g.items).find((i) => i.key === second);
  return { rail, sub };
}

/** The sub-menu label is the page title, so a page and its menu item always read the same. */
export function subLabel(rail: RailKey, key: string): string {
  return RAIL.find((r) => r.key === rail)!.groups.flatMap((g) => g.items).find((i) => i.key === key)?.label ?? key;
}

/** Where each owner-written prompt lives in Setup. */
export function ownerTextPath(key: string | null | undefined): string {
  return key === "company" ? "/settings/company" : key === "levels" ? "/settings/levels" : key === "page.pricing" ? "/settings/pricing" : "/settings/company";
}
