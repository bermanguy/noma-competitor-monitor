"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Proposed, SourceRole } from "@/pipeline/discover";
import type { CreatedSource } from "@/app/settings/wizard-actions";
import { checkPageAction, createFromWizardAction, findPagesAction, finishWizardAction, firstCheckAction } from "@/app/settings/wizard-actions";

type Step = 1 | 2 | 3;
type Check = { state: "running" | "ok" | "failed"; text: string };

const FINDING = [
  "Opening their homepage…",
  "Reading the menu…",
  "Looking for a blog and news…",
  "Finding where the articles live…",
  "Checking product and pricing pages…",
];
const ROLE_NAME: Record<SourceRole, string> = { homepage: "Homepage", posts: "Blog / news", product: "Product page", pricing: "Pricing" };
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/** A server call that can't hang the wizard: it fails after `ms`, and any failure comes back as a plain message. */
async function call<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; error: string; reload?: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      p,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); }),
    ]);
    return { ok: true, value };
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg === "timeout") return { ok: false, error: "This is taking too long. Reload the page and check the list before trying again." , reload: true };
    // After a deploy, a page opened before it can't reach the new server code.
    return { ok: false, error: "We couldn't reach the server. The app may have just been updated: reload the page and try again.", reload: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Add a competitor in three steps: website, pages to watch, first check. */
export function AddCompetitorWizard({ trigger = "card" }: { trigger?: "card" | "button" } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const fail = (r: { error: string; reload?: boolean }) => { setError(r.error); setNeedsReload(!!r.reload); };
  const [found, setFound] = useState<{ sources: Proposed[]; notes: string[]; restoring: boolean; domain: string } | null>(null);
  const [extraUrl, setExtraUrl] = useState("");
  const [extraRole, setExtraRole] = useState<SourceRole>("pricing");
  const [extraBusy, setExtraBusy] = useState(false);
  const [extraError, setExtraError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ sources: CreatedSource[]; restored: boolean } | null>(null);
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A modal <dialog> sits above the whole app, whatever the page layout does.
  useEffect(() => {
    if (open && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [open]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setTick((n) => n + 1), 1400);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    if (open && step === 1) nameRef.current?.focus();
  }, [open, step]);

  const reset = () => {
    setStep(1); setName(""); setDomain(""); setError(null); setFound(null); setCreated(null); setChecks({});
    setExtraUrl(""); setExtraError(null); setBusy(false);
  };
  const close = () => {
    if (busy) return;
    setOpen(false);
    if (step === 3) router.refresh();
    reset();
  };

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNeedsReload(false); setBusy(true); setTick(0);
    const res = await call(findPagesAction(name, domain), 90_000);
    setBusy(false);
    if (!res.ok) return fail(res);
    const r = res.value;
    if (!r.ok) return setError(r.error);
    setFound({ sources: r.sources, notes: r.notes, restoring: r.restoring, domain: r.domain });
    setStep(2);
  }

  const update = (i: number, patch: Partial<Proposed>) =>
    setFound((f) => f && { ...f, sources: f.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  async function addExtra() {
    if (!extraUrl.trim()) return;
    setExtraBusy(true); setExtraError(null);
    const res = await call(checkPageAction(extraUrl, extraRole), 45_000);
    setExtraBusy(false);
    if (!res.ok) return setExtraError(res.error);
    const r = res.value;
    if (!r.ok) return setExtraError(r.error);
    if (found?.sources.some((s) => s.url === r.source.url)) return setExtraError("That page is already in the list.");
    setFound((f) => f && { ...f, sources: [...f.sources, r.source] });
    setExtraUrl("");
  }

  async function watch() {
    if (!found) return;
    const chosen = found.sources.filter((s) => s.checked);
    setBusy(true); setError(null); setNeedsReload(false);
    const res = await call(createFromWizardAction(name, found.domain, chosen), 30_000);
    setBusy(false);
    if (!res.ok) return fail(res);
    const r = res.value;
    if (!r.ok) return setError(r.error);
    setCreated({ sources: r.sources, restored: r.restored });
    setChecks(Object.fromEntries(r.sources.map((s) => [s.id, { state: "running", text: "Reading…" }])));
    setStep(3);
    await Promise.all(
      r.sources.map(async (s) => {
        // A slow page is not a failure: it is saved, and the scheduled check reads it.
        const c = await call(firstCheckAction(s.id, r.runId), 120_000);
        setChecks((m) => ({
          ...m,
          [s.id]: c.ok ? { state: c.value.ok ? "ok" : "failed", text: c.value.text } : { state: "ok", text: "Saved · read on the next check" },
        }));
      }),
    );
    await call(finishWizardAction(), 10_000);
  }

  const chosenCount = found?.sources.filter((s) => s.checked).length ?? 0;
  const running = Object.values(checks).filter((c) => c.state === "running").length;
  const failed = Object.values(checks).filter((c) => c.state === "failed").length;
  const groups: { title: string; hint: string; roles: SourceRole[] }[] = [
    { title: "New posts", hint: "we report each new article", roles: ["posts"] },
    { title: "Pages", hint: "we report what changed on them", roles: ["homepage", "product", "pricing"] },
  ];

  return (
    <>
      {trigger === "button" ? (
        <button className="wz-open" onClick={() => setOpen(true)}><span aria-hidden>+</span> Add competitor</button>
      ) : (
        <div className="card wz-cta">
          <div>
            <strong>Add a competitor</strong>
            <div className="muted">Give us their website. We find their blog, news, product and pricing pages, and you pick what to watch.</div>
          </div>
          <button onClick={() => setOpen(true)}>Add competitor</button>
        </div>
      )}

      {open && (
        <dialog ref={dialogRef} className="wz-dialog" aria-label="Add a competitor"
          onCancel={(e) => { e.preventDefault(); close(); }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="wz">
            <div className="wz-head">
              <h2>{step === 1 ? "Add a competitor" : step === 2 ? `Add ${name}` : `${name} is being watched`}</h2>
              <p>
                {step === 1 && "Give us their website. We'll find the pages worth watching; you pick which ones."}
                {step === 2 && found && `We found ${found.sources.length} page${found.sources.length === 1 ? "" : "s"} on ${found.domain}. The checked ones will be watched.`}
                {step === 3 && (running ? "We're reading each page now, so the next check has something to compare against." : failed ? "Done, with a problem on some pages. The rest are watched." : "All set. Every page was read and saved.")}
              </p>
              <button className="wz-x" aria-label="Close" onClick={close} disabled={busy}>×</button>
            </div>
            <ol className="wz-steps">
              {["Website", "Pages to watch", "First check"].map((t, i) => (
                <li key={t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
                  <span>{i + 1 < step ? "✓" : i + 1}</span>{t}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <form onSubmit={find}>
                <div className="wz-body">
                  <label className="wz-label">Company name</label>
                  <input ref={nameRef} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HiddenLayer" disabled={busy} />
                  <label className="wz-label" style={{ marginTop: 16 }}>Website</label>
                  <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. hiddenlayer.com" disabled={busy} />
                  <div className="muted" style={{ marginTop: 6 }}>Just the domain is enough. We read their homepage menu to find product, pricing, blog and news pages.</div>
                  {busy && <div className="wz-finding"><span className="wz-spin" />{FINDING[Math.min(tick, FINDING.length - 1)]}</div>}
                  {error && <div className="wz-error">{error}{needsReload && <> <button type="button" className="secondary wz-reload" onClick={() => window.location.reload()}>Reload</button></>}</div>}
                </div>
                <div className="wz-foot">
                  <span />
                  <button type="submit" disabled={busy || !name.trim() || !domain.trim()}>{busy ? "Finding pages…" : "Find pages →"}</button>
                </div>
              </form>
            )}

            {step === 2 && found && (
              <>
                <div className="wz-body wz-scroll">
                  {found.restoring && <div className="wz-note">{name} was removed earlier. Adding it again brings back its history.</div>}
                  {groups.map((g) => {
                    const rows = found.sources.map((s, i) => ({ s, i })).filter(({ s }) => g.roles.includes(s.role));
                    if (!rows.length) return null;
                    return (
                      <div key={g.title}>
                        <div className="wz-group">{g.title} <span>· {g.hint}</span></div>
                        {rows.map(({ s, i }) => (
                          <label key={s.url} className={`wz-src${s.checked ? "" : " off"}`}>
                            <input type="checkbox" checked={s.checked} onChange={(e) => update(i, { checked: e.target.checked })} />
                            <div className="wz-src-main">
                              <div className="wz-src-name">{s.label}</div>
                              <a className="wz-src-url" href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{host(s.url)}</a>
                              {s.sample.length > 0 && <div className="wz-src-sample">Latest: {s.sample.slice(0, 2).map((t) => `“${t}”`).join(" · ")}</div>}
                            </div>
                            {s.role === "posts" || s.role === "homepage" ? (
                              <span className="wz-type">{ROLE_NAME[s.role]}</span>
                            ) : (
                              <select className="wz-type" value={s.role}
                                onChange={(e) => { const role = e.target.value as SourceRole; update(i, { role, pageType: role === "pricing" ? "pricing" : "general" }); }}>
                                <option value="product">Product page</option>
                                <option value="pricing">Pricing</option>
                              </select>
                            )}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                  {found.notes.length > 0 && <div className="wz-note">{found.notes.join(" ")}</div>}
                  <div className="wz-group">Add a page we missed</div>
                  <div className="wz-extra">
                    <input type="text" value={extraUrl} onChange={(e) => setExtraUrl(e.target.value)} placeholder={`https://${found.domain}/pricing`}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }} disabled={extraBusy} />
                    <select value={extraRole} onChange={(e) => setExtraRole(e.target.value as SourceRole)} disabled={extraBusy}>
                      <option value="pricing">Pricing</option>
                      <option value="product">Product page</option>
                      <option value="posts">Blog / news</option>
                    </select>
                    <button type="button" className="secondary" onClick={addExtra} disabled={extraBusy || !extraUrl.trim()}>{extraBusy ? "Checking…" : "Add"}</button>
                  </div>
                  {extraError && <div className="wz-error">{extraError}</div>}
                  {error && <div className="wz-error">{error}{needsReload && <> <button type="button" className="secondary wz-reload" onClick={() => window.location.reload()}>Reload</button></>}</div>}
                </div>
                <div className="wz-foot">
                  <button className="secondary" onClick={() => { setStep(1); setError(null); }} disabled={busy}>← Back</button>
                  <span className="muted">{chosenCount} page{chosenCount === 1 ? "" : "s"} selected</span>
                  <button onClick={watch} disabled={busy || chosenCount === 0}>{busy ? "Saving…" : `Watch ${chosenCount} page${chosenCount === 1 ? "" : "s"} →`}</button>
                </div>
              </>
            )}

            {step === 3 && created && (
              <>
                <div className="wz-body">
                  {created.sources.length === 0 && <div className="wz-note">These pages were already being watched. Nothing new to read.</div>}
                  {created.sources.map((s) => {
                    const c = checks[s.id];
                    return (
                      <div key={s.id} className="wz-check">
                        <div><strong>{s.label}</strong> <span className="muted">· {ROLE_NAME[s.role]}</span></div>
                        <span className={`wz-pill ${c?.state ?? "running"}`}>
                          {c?.state === "running" && <span className="wz-spin" />}
                          {c?.state === "ok" && "✓ "}
                          {c?.state === "failed" && "! "}
                          {c?.text}
                        </span>
                      </div>
                    );
                  })}
                  <div className="wz-sum">
                    {created.restored && <>{name}&apos;s earlier history is back. </>}
                    The latest few posts show up in Changes marked as published before monitoring; older ones are kept as history only. From the next check (within 3 hours) you&apos;ll see <b>new posts and real changes</b> in <b>Changes</b>, sorted by team.
                    {failed > 0 && <> Pages we couldn&apos;t read show up under <b>Needs attention</b>, and the Builder is told.</>}
                  </div>
                </div>
                <div className="wz-foot">
                  <button className="secondary" onClick={() => { router.refresh(); reset(); }} disabled={running > 0}>Add another competitor</button>
                  <button onClick={close} disabled={running > 0}>{running ? `Reading ${running} page${running === 1 ? "" : "s"}…` : "Done"}</button>
                </div>
              </>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
