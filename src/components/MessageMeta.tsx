import { clockOf, seenAgo, stampOf, type Msg } from "../lib/store";

/* ------------------------------------------------------------------ *
 *  The small print of a conversation: when a line was sent, whether it
 *  has been seen, and the three dots while the other one is writing.
 * ------------------------------------------------------------------ */

/** a tiny timestamp, e.g. "21:04" (older than today gets a date too) */
export function Stamp({
  at,
  repeat,
  className = "",
}: {
  at: number;
  /** a ritual pressed on repeat: "×3 · 21:04" */
  repeat?: number;
  className?: string;
}) {
  return (
    <span className={`font-mono text-[9.5px] tracking-[0.06em] whitespace-nowrap ${className}`}>
      {repeat && repeat > 1 ? `×${repeat} · ` : ""}
      {stampOf(at)}
    </span>
  );
}

/**
 * Read receipts for what YOU sent: one tick = sent, two = seen, with the
 * moment she opened it. Rendered under the bubble, never inside it.
 */
export function ReadTicks({ m, className = "" }: { m: Msg; className?: string }) {
  const seen = typeof m.readAt === "number" && m.readAt > 0;
  return (
    <span
      title={seen ? `Seen ${stampOf(m.readAt!)}` : "Sent"}
      className={`font-mono text-[9.5px] tracking-[0.06em] whitespace-nowrap ${
        seen ? "text-brass-soft/80" : "text-white/40"
      } ${className}`}
    >
      {seen ? `✓✓ seen ${clockOf(m.readAt!)}` : "✓ sent"}
    </span>
  );
}

/** "Mistress is writing…" — three dots that breathe */
export function TypingDots({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "justify-end" : "justify-start"}`}>
      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="mt-0.5 h-1.5 w-1.5 animate-bounce rounded-full bg-brass-soft/70"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: "1s" }}
            />
          ))}
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.12em] text-white/45 uppercase">{label} is writing</span>
      </div>
    </div>
  );
}

/** the chat's own header line: who is on the other side, and when last seen */
export function PresenceBar({
  name,
  avatar,
  lastSeenAt,
  live,
}: {
  name: string;
  avatar?: React.ReactNode;
  lastSeenAt?: number | null;
  live: boolean;
}) {
  const recent = lastSeenAt ? Date.now() - lastSeenAt < 120_000 : false;
  return (
    <div className="flex items-center gap-2 border-b border-white/8 bg-black/35 px-3 py-1.5 backdrop-blur-sm">
      {avatar}
      <span className="font-mono text-[10px] tracking-[0.16em] text-white/50 uppercase">{name}</span>
      <span className="flex-1" />
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] text-white/35">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            live && recent ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.8)]" : "bg-white/25"
          }`}
        />
        {live && recent ? "here now" : lastSeenAt ? `last seen ${seenAgo(lastSeenAt)}` : "away"}
      </span>
    </div>
  );
}
