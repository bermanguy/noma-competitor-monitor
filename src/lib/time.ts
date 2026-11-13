import { config } from "../config";

/**
 * Every date people read is shown in the app's local time zone (Israel by default), never UTC.
 * The server renders the pages, so the zone comes from config, not the browser.
 */
const tz = () => config.timezone;
const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);
const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz(), ...o }).format(d);

/** "2026-11-13" in local time. */
export const localDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz(), year: "numeric", month: "2-digit", day: "2-digit" }).format(asDate(d));
/** "13:48" */
export const localTime = (d: Date | string) => part(asDate(d), { hour: "2-digit", minute: "2-digit", hour12: false });
/** "Fri 13 Nov" */
export const localDate = (d: Date | string) => part(asDate(d), { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
/** "Fri 13 Nov, 13:48" */
export const localDateTime = (d: Date | string) => `${localDate(d)}, ${localTime(d)}`;
/** "13:48" when it is today, otherwise "13 Nov". */
export const localShort = (d: Date | string, now = new Date()) =>
  localDay(d) === localDay(now) ? localTime(d) : part(asDate(d), { day: "numeric", month: "short" });
