import { useState, type ReactNode } from "react";
import type { Msg } from "../lib/store";
import { ReadTicks, Stamp } from "./MessageMeta";
import Linkify from "./Linkify";

/* ------------------------------------------------------------------ *
 *  An ACTION in the chat — a strike, a decree, a check-in, a tribute.
 *
 *  These are not conversation, they are record. They used to be big
 *  centred slabs that ate the whole width of the thread, so three of
 *  them filled the window and the history vanished above the fold.
 *
 *  Here they are small, they take only the width they need, and the
 *  colour of the box says what kind of act it was at a glance:
 *
 *    💥 punishment  → red      📜 decree / condition → violet
 *    📍 check-in    → red      💰 tribute / reward   → brass
 *    🖤 mercy, praise, anything granted or met → emerald
 * ------------------------------------------------------------------ */

export type ActionTone = "rose" | "oxblood" | "violet" | "brass" | "amber" | "emerald" | "slate";

const TONE: Record<ActionTone, { box: string; title: string; body: string; chip: string }> = {
  /* 💥 discipline — the house red */
  rose: {
    box: "border-rose-400/35 bg-rose-500/12",
    title: "text-rose-200/90",
    body: "text-rose-50/70",
    chip: "border-rose-300/40 bg-rose-500/12 text-rose-100/90",
  },
  /* 📍 a demand still owed — deeper, darker red */
  oxblood: {
    box: "border-rose-500/40 bg-oxblood/35",
    title: "text-rose-200/85",
    body: "text-rose-50/70",
    chip: "border-rose-400/45 bg-oxblood/50 text-rose-100/90",
  },
  /* 📜 decrees & conditions */
  violet: {
    box: "border-violet-400/35 bg-violet-500/14",
    title: "text-violet-200/90",
    body: "text-violet-50/70",
    chip: "border-violet-300/40 bg-violet-500/12 text-violet-100/90",
  },
  /* 💰 tribute, standing, rewards */
  brass: {
    box: "border-brass/35 bg-brass/10",
    title: "text-brass/85",
    body: "text-brass-soft/80",
    chip: "border-brass/40 bg-brass/12 text-brass-soft",
  },
  /* ⏳ waiting on a verdict */
  amber: {
    box: "border-amber-400/40 bg-amber-500/12",
    title: "text-amber-200/90",
    body: "text-amber-50/70",
    chip: "border-amber-300/40 bg-amber-500/12 text-amber-100/90",
  },
  /* 🖤 granted, met, released */
  emerald: {
    box: "border-emerald-400/35 bg-emerald-500/10",
    title: "text-emerald-200/90",
    body: "text-emerald-50/70",
    chip: "border-emerald-300/40 bg-emerald-500/12 text-emerald-100/90",
  },
  /* ⚙️ the engine talking */
  slate: {
    box: "border-white/12 bg-white/[0.035]",
    title: "text-white/45",
    body: "text-white/55",
    chip: "border-white/15 bg-white/[0.05] text-white/50",
  },
};

/* ---------- what each recorded act looks like ---------- *
 * Titles are the stable constants written by the engine (store.ts).
 * Anything unknown falls back to a neutral decree.
 */
const LOOK: Record<string, { icon: string; tone: ActionTone }> = {
  /* discipline 💥 — red */
  "Mistress Strikes": { icon: "💥", tone: "rose" },
  "Penance Assigned": { icon: "⛓️", tone: "rose" },
  "Mistress Exposes": { icon: "👁️", tone: "rose" },
  "The Wheel Has Spoken": { icon: "🎡", tone: "rose" },
  "Proof Rejected": { icon: "❌", tone: "rose" },
  "Devotion Lowered": { icon: "💔", tone: "rose" },
  "Tribute Declined": { icon: "💸", tone: "rose" },

  /* conditions & decrees 📜 — violet */
  "Decree Issued": { icon: "📜", tone: "violet" },
  "Mistress Gags": { icon: "🤐", tone: "violet" },
  "Mistress Locks": { icon: "🔒", tone: "violet" },
  "Gag Extended": { icon: "🤐", tone: "violet" },
  "Chastity Extended": { icon: "🔒", tone: "violet" },

  /* granted, met, released 🖤 — emerald */
  "Gag Lifted": { icon: "🕊️", tone: "emerald" },
  "Chastity Released": { icon: "🕊️", tone: "emerald" },
  "Mercy Granted": { icon: "🕊️", tone: "emerald" },
  "Mistress Approves": { icon: "🖤", tone: "emerald" },
  "Proof Accepted": { icon: "✅", tone: "emerald" },
  "Devotion Raised": { icon: "♥", tone: "emerald" },

  /* standing & ledger 💰 — brass */
  "Collar Raised": { icon: "👑", tone: "brass" },
  "Tribute Paid": { icon: "💰", tone: "brass" },
  "Tribute Offered": { icon: "💰", tone: "amber" },
  "Tribute Demanded": { icon: "💰", tone: "brass" },
  "Reward Granted": { icon: "👠", tone: "brass" },
  "Locked Teaser": { icon: "🔒", tone: "brass" },

  /* his own service ⛓️ — brass, it is devotion after all */
  "Penance Reported": { icon: "⛓️", tone: "brass" },
  "Worship Offered": { icon: "👑", tone: "brass" },
  Kneeling: { icon: "🧎", tone: "brass" },
  Begging: { icon: "🙏", tone: "brass" },
  Confession: { icon: "📿", tone: "brass" },
  "Boot Service": { icon: "👢", tone: "brass" },

  /* location 📍 — red while it is owed, emerald once answered */
  "Check-In Demanded": { icon: "📍", tone: "oxblood" },
  "Checked In": { icon: "📍", tone: "emerald" },
  "Checked In · Late": { icon: "📍", tone: "amber" },
  "Location Shared": { icon: "📍", tone: "emerald" },
};

/** icon + colour for any recorded act */
export function actionLook(m: Msg): { icon: string; tone: ActionTone } {
  const hit = m.title ? LOOK[m.title] : undefined;
  if (hit) return hit;
  if (m.kind === "refusal") return { icon: "⛔", tone: "rose" };
  if (m.kind === "system") return { icon: "⚙️", tone: "slate" };
  return { icon: "📜", tone: m.from === "mistress" ? "violet" : "slate" };
}

/** a tiny state pill: "12m left", "♥ +4", "paid" */
export function Chip({ tone = "slate", children }: { tone?: ActionTone; children: ReactNode }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-px font-mono text-[8.5px] tracking-[0.08em] whitespace-nowrap uppercase ${TONE[tone].chip}`}
    >
      {children}
    </span>
  );
}

/** long orders stay readable without costing four lines of history */
const CLAMP_AT = 116;

export default function ChatAction({
  m,
  icon,
  title,
  tone = "slate",
  body,
  value,
  chip,
  align = "start",
  ticks = false,
  children,
  wide = false,
}: {
  m: Msg;
  icon?: string;
  /** absent = the body itself is the line (system notes) */
  title?: string;
  tone?: ActionTone;
  body?: string;
  /** a figure worth its own weight, e.g. a tribute amount */
  value?: ReactNode;
  chip?: ReactNode;
  align?: "start" | "end";
  ticks?: boolean;
  children?: ReactNode;
  /** cards that carry an image need a little more room */
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = TONE[tone];
  const long = (body?.length || 0) > CLAMP_AT;

  const meta = (
    <span className="inline-flex shrink-0 items-center gap-1 align-baseline">
      <Stamp at={m.time} className="text-white/25" />
      {ticks && <ReadTicks m={m} compact />}
    </span>
  );

  /* an engine note with no headline: one flowing line, the clock at the end of it */
  if (!title)
    return (
      <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
        <div className={`min-w-0 rounded-md border px-2 py-1 ${wide ? "w-full max-w-[86%]" : "max-w-[88%]"} ${t.box}`}>
          <p className={`text-[11.5px] leading-snug [overflow-wrap:anywhere] ${t.body}`}>
            {icon && <span className="mr-1">{icon}</span>}
            {body && <Linkify text={body} />}
            <span className="ml-1.5">{meta}</span>
          </p>
          {children}
        </div>
      </div>
    );

  return (
    <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
      <div className={`min-w-0 rounded-md border px-2 py-1 ${wide ? "w-full max-w-[86%]" : "max-w-[88%]"} ${t.box}`}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {icon && <span className="text-[10.5px] leading-none">{icon}</span>}
          <span className={`font-mono text-[9px] leading-tight tracking-[0.12em] uppercase ${t.title}`}>{title}</span>
          {m.repeat && m.repeat > 1 ? <span className="font-mono text-[9px] text-white/40">×{m.repeat}</span> : null}
          {value}
          {chip}
          <span className="ml-auto pl-1">{meta}</span>
        </div>

        {body && (
          <p className={`text-[11.5px] leading-snug [overflow-wrap:anywhere] ${t.body} ${long && !open ? "line-clamp-2" : ""}`}>
            <Linkify text={body} />
          </p>
        )}
        {body && long && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="font-mono text-[8.5px] tracking-[0.1em] text-white/35 uppercase transition hover:text-white/70"
          >
            {open ? "· less" : "· more"}
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
