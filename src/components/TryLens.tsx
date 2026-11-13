"use client";
import { useActionState } from "react";
import type { LensTrial } from "@/pipeline/preview";

type State = { trials?: LensTrial[]; lens?: string; error?: string };
const LEVEL: Record<string, string> = { alert: "Urgent", digest: "Worth knowing", log: "FYI", none: "Not relevant" };
const Tag = ({ level }: { level: string }) => <span className={`lvl lvl-${level}`}>{LEVEL[level] ?? level}</span>;

/**
 * The owner edits their team's description and sees, on their latest changes, what the edit would
 * change. Nothing is saved until they press Save.
 */
export function TryLens({ teamKey, teamName, lens, tryAction, saveAction, checking, total }: {
  teamKey: string; teamName: string; lens: string; checking?: boolean; total?: number;
  tryAction: (prev: State, form: FormData) => Promise<State>;
  saveAction: (form: FormData) => Promise<void>;
}) {
  const [state, run, pending] = useActionState(tryAction, {});
  const changed = state.trials?.filter((t) => t.after && t.after.level !== t.before.level).length ?? 0;
  return (
    <form className="card tune" action={run}>
      <input type="hidden" name="key" value={teamKey} />
      <input type="hidden" name="back" value={`/settings/preview?team=${teamKey}`} />
      <strong>Fine-tune what {teamName} gets</strong>
      <p className="muted" style={{ margin: "4px 0 8px" }}>This is the brief the system reads when it decides what matters to {teamName}. <strong>1.</strong> Edit it. <strong>2.</strong> Try it on your latest changes (a few seconds). <strong>3.</strong> Save: before it goes live, it is checked on {total ?? "all"} test posts for every team (about 2 minutes), so a fix for {teamName} can&apos;t quietly make another team&apos;s updates worse.</p>
      {/* Remounted after each trial, so the box keeps exactly what the owner tried. */}
      <textarea key={state.lens ?? ""} name="lens" defaultValue={state.lens ?? lens} style={{ minHeight: 140 }} />
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button type="submit" disabled={pending}>{pending ? "Judging your latest changes…" : "Try my edit on the last 5 changes"}</button>
        <button type="submit" formAction={saveAction} className="secondary" disabled={pending || checking}>{checking ? "Checking…" : "Save and check"}</button>
      </div>
      {state.error && <div className="notice bad" style={{ marginTop: 10 }}>{state.error}</div>}
      {state.trials && (
        <div className="trials">
          <div className="trials-h">{changed === 0 ? "Your edit keeps every level the same." : `Your edit changes ${changed} of ${state.trials.length}.`}</div>
          {state.trials.map((t) => {
            const moved = t.after && t.after.level !== t.before.level;
            return (
              <div key={t.itemId} className={`trial${moved ? " moved" : ""}`}>
                <div className="trial-t"><span className="muted">{t.competitor}</span> <a href={t.url} target="_blank" rel="noreferrer">{t.title}</a></div>
                <div className="trial-cols">
                  <div><div className="trial-l">Today</div><Tag level={t.before.level} /><p>{t.before.why}</p></div>
                  <div><div className="trial-l">With your edit</div>{t.after ? <><Tag level={t.after.level} /><p>{t.after.why}</p></> : <p className="muted">{t.error}</p>}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}
