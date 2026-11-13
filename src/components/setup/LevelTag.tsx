import type { Level } from "@/db/schema";

/** The level names and icons the Changes page uses, for the Setup pages. */
export const LEVEL_NAME: Record<Level, string> = { alert: "Urgent", digest: "Worth knowing", log: "FYI", none: "Not relevant" };
export const LEVELS: Level[] = ["alert", "digest", "log", "none"];

export function LevelIcon({ level }: { level: Level }) {
  if (level === "alert") return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M8.6 3.8 5.6 8.7h2.3l-.6 3.5 3.1-5h-2.3z" fill="#fff" /></svg>;
  if (level === "digest") return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>;
  if (level === "log") return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2" /></svg>;
  return <svg className="lv-i" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 12 12 4" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export const LevelTag = ({ level }: { level: Level }) => <span className={`lvl lvl-${level}`}><LevelIcon level={level} />{LEVEL_NAME[level]}</span>;

/** One radio row per team: the four levels as a segmented control. Posts as `level:<team>`, which addToExamAction reads. */
export function LevelPicker({ teamKey, value }: { teamKey: string; value: Level }) {
  return (
    <div className="lv-pick" role="radiogroup">
      {LEVELS.map((l) => (
        <label key={l} className={`lvl-${l}`}>
          <input type="radio" name={`level:${teamKey}`} value={l} defaultChecked={l === value} />
          <span><LevelIcon level={l} />{LEVEL_NAME[l]}</span>
        </label>
      ))}
    </div>
  );
}
