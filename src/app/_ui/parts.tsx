import type { Level } from "@/db/schema";

export const LEVEL_TEXT: Record<Level, string> = {
  alert: "Sent now",
  digest: "Daily digest",
  log: "Recorded, not sent",
  none: "Not relevant",
};
export const LEVEL_ORDER: Record<Level, number> = { alert: 0, digest: 1, log: 2, none: 3 };
export const isSent = (l: Level) => l === "alert" || l === "digest";

export function LevelChip({ level }: { level: Level }) {
  return <span className={`chip lv-${level}`}>{LEVEL_TEXT[level]}</span>;
}

/** Messages that come back from a form, through ?added= or ?error=. */
export function Flash({ added, error }: { added?: string; error?: string }) {
  return (
    <>
      {added && <div className="notice">{added}</div>}
      {error && <div className="notice error">{error}</div>}
    </>
  );
}

export function ago(d: Date, now = new Date()): string {
  const m = Math.round((+now - +d) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 14 ? `${days} days ago` : d.toISOString().slice(0, 10);
}
