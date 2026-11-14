/**
 * The Changes page's company filter: a set of companies to show, kept in the URL.
 * `company=1,4` shows only those companies (older links use a single id). `hide=2,3` shows every company but those.
 * With neither, test pages (Canary) are hidden by default; `hide=none` shows everything.
 */
export interface CompanyParams { company?: string; hide?: string }

const ids = (s?: string) => (s ?? "").split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

/** The ids of the companies to show. */
export function shownCompanies(sp: CompanyParams, all: number[], defaultHidden: number[]): Set<number> {
  const only = ids(sp.company);
  if (only.length) return new Set(only.filter((id) => all.includes(id)));
  const hidden = sp.hide === "none" ? [] : sp.hide ? ids(sp.hide) : defaultHidden;
  return new Set(all.filter((id) => !hidden.includes(id)));
}

/** The URL params for a set of shown companies, as short as possible. Undefined values mean "leave out". */
export function companyParams(shown: Set<number>, all: number[], defaultHidden: number[]): CompanyParams {
  const on = all.filter((id) => shown.has(id));
  const off = all.filter((id) => !shown.has(id));
  const isDefault = off.length === defaultHidden.length && off.every((id) => defaultHidden.includes(id));
  if (isDefault) return { company: undefined, hide: undefined };
  if (off.length === 0) return { company: undefined, hide: "none" };
  if (on.length > 0 && on.length <= off.length) return { company: on.join(","), hide: undefined };
  return { company: undefined, hide: off.join(",") };
}

/** Whether the shown set is the default (everything but test pages). */
export const isDefaultCompanies = (shown: Set<number>, all: number[], defaultHidden: number[]) =>
  companyParams(shown, all, defaultHidden).company === undefined && companyParams(shown, all, defaultHidden).hide === undefined;
