"use client";
import { useEffect, useRef, useState } from "react";

const TILE = ["#5b21b6", "#0f172a", "#0284c7", "#15803d", "#d97706", "#be123c", "#0e7490", "#7c2d12"];

/** Our own line-drawn canary, used for the test pages instead of a site icon. */
function CanaryIcon({ size }: { size: number }) {
  return (
    <span className="co-logo canary" style={{ width: size, height: size, borderRadius: size / 4 }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.78} height={size * 0.78} fill="none" stroke="#7a4a00" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* tail, then body and head in one outline */}
        <path d="M7.4 12.4 L2.6 12.8 L7 14.6 Z" fill="#facc15" />
        <path d="M7 13.2 C7.6 16.6 10.4 18.6 13.6 18.2 C17.2 17.8 19.2 14.8 18.6 11.6 C18.4 10.4 18 9.6 17.5 9 C18.1 6.8 16.6 4.8 14.4 4.8 C12.2 4.8 10.8 6.6 11 8.6 C9.2 9 7.8 10.4 7.2 12 C7.1 12.4 7 12.8 7 13.2 Z" fill="#facc15" />
        {/* beak */}
        <path d="M17.7 7 L21 8.1 L17.8 9.3 Z" fill="#f97316" stroke="#c2410c" strokeWidth={1} />
        {/* wing */}
        <path d="M10 12.2 C11.6 14.6 14.2 15 16.2 13.6" />
        {/* legs */}
        <path d="M12.4 18.3 L12 21 M15 17.8 L15.2 21" />
        <circle cx="15" cy="7.2" r="0.9" fill="#7a4a00" stroke="none" />
      </svg>
    </span>
  );
}

/** The company's own site icon, or a coloured letter tile when the site has none. The canary gets its own bird. */
export function CompanyLogo({ id, name, domain, size = 28, canary }: { id?: number; name: string; domain: string; size?: number; canary?: boolean }) {
  // Many sites (Webflow, Framer) have no /favicon.ico and declare their icon in the page instead, so a
  // missing favicon falls back to Google's icon service, which reads the page. Then a letter tile.
  // The logo we kept when the competitor was added comes first; then the site icon, Google's icon service, a letter tile.
  const sources = [...(id ? [`/logo/${id}`] : []), `https://${domain}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${domain}&sz=64`];
  const [step, setStep] = useState(0);
  const failed = step >= sources.length;
  const next = () => setStep((n) => n + 1);
  const img = useRef<HTMLImageElement>(null);
  // The icon can fail to load before React attaches onError (the page is rendered on the server), and then
  // onError never fires and the browser shows its broken-image box. Check once on mount to catch that case.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth < 8 && !sources[step]?.startsWith("/logo/")) next();
  }, [step]);
  if (canary) return <CanaryIcon size={size} />;
  const color = TILE[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TILE.length];
  const style = { width: size, height: size, borderRadius: size / 4, fontSize: size * 0.45 };
  if (failed || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return <span className="co-logo tile" style={{ ...style, background: color }} aria-hidden>{name[0]}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={img} className="co-logo" style={style} key={step} src={sources[step]} alt="" onError={next}
      // Google answers an unknown site with a 16px globe: treat that as no icon.
      onLoad={(e) => { const src = sources[step]!; if (!src.startsWith("/logo/") && e.currentTarget.naturalWidth < (src.includes("google.com") ? 17 : 8)) next(); }} />
  );
}
