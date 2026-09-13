import { useMemo } from "react";

/* ------------------------------------------------------------------ *
 *  Links in chat. Anything that looks like a URL becomes something he
 *  can actually tap — in either direction, in every kind of line.
 * ------------------------------------------------------------------ */

/** http(s)://… or www.… up to the next space or angle bracket */
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"]+)/gi;

/** sentence punctuation that never belongs to the link itself */
const TAIL_CHARS = new Set([".", ",", ";", ":", "!", "?", "·", "…", "*", "'", '"', "’", "”", "«", "»"]);

/**
 * Peel sentence punctuation off the end of a match. A bracket only belongs to
 * the link when the link opened one — "(see this)" is prose, "en.wikipedia.org/wiki/A_(B)" is not.
 */
function trim(url: string) {
  let s = url;
  let tail = "";
  for (;;) {
    const ch = s[s.length - 1];
    if (!ch) break;
    if (TAIL_CHARS.has(ch)) {
      tail = ch + tail;
      s = s.slice(0, -1);
      continue;
    }
    if (ch === ")" && (s.match(/\(/g) || []).length < (s.match(/\)/g) || []).length) {
      tail = ch + tail;
      s = s.slice(0, -1);
      continue;
    }
    if (ch === "]" && (s.match(/\[/g) || []).length < (s.match(/\]/g) || []).length) {
      tail = ch + tail;
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return { url: s, tail };
}

export default function Linkify({
  text,
  className = "",
}: {
  text: string;
  /** extra classes for the anchors only */
  className?: string;
}) {
  const parts = useMemo(() => (text || "").split(URL_RE), [text]);

  return (
    <>
      {parts.map((part, i) => {
        /* split() with a capture group puts the matches on odd indexes */
        if (i % 2 === 0 || !part) return part;

        const { url, tail } = trim(part);
        if (!url) return part;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

        return (
          <span key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={href}
              className={`text-brass-soft underline decoration-brass/55 underline-offset-2 transition hover:text-white hover:decoration-brass [overflow-wrap:anywhere] ${className}`}
            >
              {url}
            </a>
            {tail}
          </span>
        );
      })}
    </>
  );
}
