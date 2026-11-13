import type { ReactNode } from "react";

/**
 * Draws a Slack Block Kit message the way Slack shows it, for the owner's preview. It reads the same
 * payload that is posted, so what the owner sees is what the team gets. Covers what our messages use:
 * header, section and context blocks with Slack's mrkdwn (*bold*, _italic_, <url|link>, > quotes).
 */
type Block =
  | { type: "header"; text: { text: string } }
  | { type: "section"; text: { text: string } }
  | { type: "context"; elements: { text: string }[] };

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  // Links first, then bold and italic, which in our messages never span a link.
  const re = /<([^|>]+)\|([^>]+)>|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let at = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(unesc(text.slice(at, m.index)));
    const k = `${key}-${n++}`;
    if (m[1]) {
      const label = inline(m[2]!, n);
      // Rating links would record a real vote, so in a preview they only look like links.
      out.push(m[1].includes("/feedback/") ? <span key={k} className="sl-a">{label}</span> : <a key={k} href={m[1]} target="_blank" rel="noreferrer">{label}</a>);
    } else if (m[3]) out.push(<strong key={k}>{inline(m[3], n)}</strong>);
    else if (m[4]) out.push(<em key={k}>{inline(m[4], n)}</em>);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(unesc(text.slice(at)));
  return out;
}

function Mrkdwn({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((l, i) =>
        l.startsWith("> ") ? <blockquote key={i} className="sl-q">{inline(l.slice(2), i)}</blockquote>
          : <div key={i} className={l.startsWith("      ") ? "sl-indent" : undefined}>{l.trim() ? inline(l.trim(), i) : " "}</div>,
      )}
    </>
  );
}

export function SlackMessage({ payload, app = "Competitor monitor", time }: { payload: { blocks: unknown[] }; app?: string; time?: string }) {
  const blocks = payload.blocks as Block[];
  return (
    <div className="sl-msg">
      <img className="sl-avatar" src="/logo.png" alt="" width={36} height={36} />
      <div className="sl-body">
        <div className="sl-who"><strong>{app}</strong><span className="sl-app">APP</span>{time && <span className="sl-time">{time}</span>}</div>
        {blocks.map((b, i) => {
          if (b.type === "header") return <div key={i} className="sl-header">{b.text.text}</div>;
          if (b.type === "section") return <div key={i} className="sl-section"><Mrkdwn text={b.text.text} /></div>;
          if (b.type === "context") return <div key={i} className="sl-context">{b.elements.map((e, k) => <Mrkdwn key={k} text={e.text} />)}</div>;
          return null;
        })}
      </div>
    </div>
  );
}
