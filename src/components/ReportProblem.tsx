"use client";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

// Kept in step with src/lib/reports.ts, which checks again on the server.
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;
const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`);

function fileProblem(f: File): string | null {
  const image = f.type.startsWith("image/"), video = f.type.startsWith("video/");
  if (!image && !video) return "Attach a screenshot or a video. Other files can't be shown.";
  if (image && f.size > MAX_IMAGE) return `That screenshot is ${mb(f.size)}. Screenshots can be up to 5 MB.`;
  if (video && f.size > MAX_VIDEO) return `That video is ${mb(f.size)}. Videos can be up to 25 MB, about 30 seconds of screen recording.`;
  return null;
}

const BUG = "M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 1 1 6 0v1.1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9M6.5 13H3M21 13h-3.5M4 21c0-2.1 1.6-3.8 3.6-4M20 21c0-2.1-1.6-3.8-3.6-4M4 7c0 2 1.5 3.5 3.3 3.8M20 7c0 2-1.5 3.5-3.3 3.8";

/** The "Report a problem" button in the rail and its dialog. Any role can send one, from any page. */
export function ReportProblem() {
  const path = usePathname();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"edit" | "sending" | "sent">("edit");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const open = () => { setState("edit"); setError(null); ref.current?.showModal(); };
  const close = () => {
    ref.current?.close();
    if (state === "sent") { setText(""); setFile(null); setState("edit"); }
  };
  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const p = fileProblem(f);
    setError(p);
    if (!p) setFile(f);
  };
  const onPaste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/") || x.type.startsWith("video/"));
    if (f) { e.preventDefault(); pick(f); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };

  async function send() {
    if (!text.trim()) { setError("Say what went wrong."); return; }
    setState("sending"); setError(null);
    const form = new FormData();
    form.set("description", text);
    form.set("page", path + window.location.search);
    if (file) form.set("file", file, file.name || "screenshot.png");
    try {
      const res = await fetch("/api/report", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The report wasn't sent (${res.status}). Try again.`);
      setState("sent");
      router.refresh(); // the Builder badge counts open reports
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "The report wasn't sent. Check your connection and try again." : (e as Error).message);
      setState("edit");
    }
  }

  return (
    <>
      <button type="button" className="rail-item rail-report" onClick={open} title="Report a problem with this page">
        <span className="rail-icon"><svg viewBox="0 0 24 24" aria-hidden><path d={BUG} /></svg></span>
        Report a problem
      </button>
      <dialog ref={ref} className="wz-dialog rp-dialog" aria-label="Report a problem" onClose={close}
        onMouseDown={(e) => { if (e.target === ref.current) close(); }}>
        <div className="wz rp" onPaste={onPaste}>
          <button type="button" className="wz-x" onClick={close} aria-label="Close">×</button>
          {state === "sent" ? (
            <div className="rp-done">
              <div className="rp-check">✓</div>
              <h2>Thanks, it&apos;s reported</h2>
              <p>Guy gets it right away, with the page you were on.</p>
              <button type="button" onClick={close}>Done</button>
            </div>
          ) : (
            <>
              <div className="wz-head">
                <h2>Report a problem</h2>
                <p>Something broken, wrong or confusing? Tell us what happened. We add the page you&apos;re on.</p>
              </div>
              <div className="rp-body">
                <label className="rp-label" htmlFor="rp-text">What went wrong?</label>
                <textarea id="rp-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} autoFocus
                  placeholder="For example: I clicked Save on the Topics page and nothing happened." />
                <div className="rp-label">Screenshot or video <span className="muted">(optional)</span></div>
                {file ? (
                  <div className="rp-file">
                    {preview && (file.type.startsWith("video/") ? <video src={preview} muted /> : <img src={preview} alt="" />)}
                    <div><strong>{file.name || "Pasted screenshot"}</strong><div className="muted">{mb(file.size)}</div></div>
                    <button type="button" className="secondary" onClick={() => setFile(null)}>Remove</button>
                  </div>
                ) : (
                  <div className={`rp-drop${drag ? " on" : ""}`} onClick={() => input.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
                    role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}>
                    <strong>Choose a file</strong>, drag it here, or paste a screenshot (⌘V / Ctrl+V)
                    <div className="muted">Screenshots up to 5 MB · videos up to 25 MB, about 30 seconds</div>
                  </div>
                )}
                <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                {error && <div className="rp-error" role="alert">{error}</div>}
              </div>
              <div className="rp-foot">
                <span className="muted">Page: {path}</span>
                <button type="button" className="secondary" onClick={close}>Cancel</button>
                <button type="button" onClick={send} disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send report"}</button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
