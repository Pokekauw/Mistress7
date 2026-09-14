import { useCallback, useEffect, useRef, type Ref } from "react";

/* ------------------------------------------------------------------ *
 *  The chat box — hers and his both.
 *
 *  ⏎ sends.  ⇧⏎ breaks the line and starts a new paragraph. That is the
 *  whole rule, and it is the same for a Mistress addressing her slave as
 *  for a slave writing to his Mistress. The box grows with what is typed
 *  and starts scrolling once it has a few lines in it.
 * ------------------------------------------------------------------ */

/** height at which the box stops growing and scrolls instead */
export const CHAT_INPUT_MAX_H = 152;

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** ⏎ — send whatever is in the box */
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** leaving the box — the typing indicator dies here */
  onBlur?: () => void;
  /** look of the box (border / background / text), everything but the shape */
  className?: string;
  /** forwarded so the emoji panel can drop a snippet at the caret */
  ref?: Ref<HTMLTextAreaElement>;
};

export default function ChatInput({ value, onChange, onSubmit, placeholder, disabled, onBlur, className = "", ref }: Props) {
  const own = useRef<HTMLTextAreaElement | null>(null);

  const attach = useCallback(
    (node: HTMLTextAreaElement | null) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object") (ref as { current: HTMLTextAreaElement | null }).current = node;
    },
    [ref]
  );

  /* one line, then two, then it stops and scrolls */
  useEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, CHAT_INPUT_MAX_H)}px`;
    el.style.overflowY = el.scrollHeight > CHAT_INPUT_MAX_H ? "auto" : "hidden";
  }, [value]);

  return (
    <textarea
      ref={attach}
      rows={1}
      value={value}
      disabled={disabled}
      enterKeyHint="send"
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        /* ⇧⏎ — a paragraph. nothing leaves the box */
        if (e.shiftKey) return;
        /* a keyboard still composing a word (é, 漢字…) is not a send */
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        onSubmit();
      }}
      placeholder={placeholder}
      title="⏎ sends · ⇧⏎ new paragraph"
      className={`thin-scroll block min-w-0 flex-1 resize-none overflow-hidden rounded-3xl border px-4 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    />
  );
}

/**
 * Splice a snippet into the text where the caret sits — so an emoji lands
 * where he was typing, not dumped at the end of the sentence.
 */
export function insertAtCaret(value: string, snippet: string, start: number, end: number) {
  const a = Math.max(0, Math.min(Number.isFinite(start) ? start : value.length, value.length));
  const b = Math.max(a, Math.min(Number.isFinite(end) ? end : a, value.length));
  return {
    next: `${value.slice(0, a)}${snippet}${value.slice(b)}`,
    caret: a + snippet.length,
  };
}
