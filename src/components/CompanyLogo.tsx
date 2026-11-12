"use client";
import { useState } from "react";

const TILE = ["#5b21b6", "#0f172a", "#0284c7", "#15803d", "#d97706", "#be123c", "#0e7490", "#7c2d12"];

/** The company's own site icon, or a coloured letter tile when the site has none. */
export function CompanyLogo({ name, domain, size = 28 }: { name: string; domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const color = TILE[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TILE.length];
  const style = { width: size, height: size, borderRadius: size / 4, fontSize: size * 0.45 };
  if (failed || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return <span className="co-logo tile" style={{ ...style, background: color }} aria-hidden>{name[0]}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="co-logo" style={style} src={`https://${domain}/favicon.ico`} alt="" onError={() => setFailed(true)}
      onLoad={(e) => { if (e.currentTarget.naturalWidth < 8) setFailed(true); }} />
  );
}
