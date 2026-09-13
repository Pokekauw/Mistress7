import { useMemo, useState } from "react";
import { money, type Msg } from "../lib/store";
import Linkify from "./Linkify";

/**
 * A plain chronological record of what was ordered and what became of it.
 * Deliberately unglamorous: its whole value is that neither party can
 * dispute the sequence.
 */

type Entry = {
  id: string;
  at: number;
  icon: string;
  title: string;
  detail: string;
  outcome: "pending" | "met" | "failed" | "neutral";
  by: "mistress" | "sub" | "system";
};

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function toEntry(m: Msg): Entry | null {
  const base = { id: m.id, at: m.time, by: m.from };

  switch (m.kind) {
    case "decree":
      if (m.from !== "mistress") return null;
      return { ...base, icon: "📜", title: m.title || "Decree", detail: m.text, outcome: "neutral" };
    case "locreq":
      return {
        ...base,
        icon: "📍",
        title: "Check-in demanded",
        detail: m.text,
        outcome: m.locState === "fulfilled" ? "met" : m.locState === "expired" ? "failed" : "pending",
      };
    case "location":
      return { ...base, icon: "📍", title: m.title || "Location confirmed", detail: m.text, outcome: "met" };
    case "demand":
      return {
        ...base,
        icon: "💰",
        title: "Tribute demanded",
        detail: money(m.amount || 0),
        outcome: m.status === "paid" ? "met" : m.status === "declined" ? "failed" : "pending",
      };
    case "tribute":
      return {
        ...base,
        icon: "💰",
        title:
          m.verdict === "pending"
            ? "Tribute offered"
            : m.verdict === "rejected"
              ? "Tribute declined"
              : "Tribute rendered",
        detail: money(m.amount || 0),
        /* legacy tributes carry no verdict and were paid immediately */
        outcome: m.verdict === "pending" ? "pending" : m.verdict === "rejected" ? "failed" : "met",
      };
    case "proof":
      return {
        ...base,
        icon: "📸",
        title: "Proof submitted",
        detail: m.text,
        outcome: m.verdict === "accepted" ? "met" : m.verdict === "rejected" ? "failed" : "pending",
      };
    case "media":
      return { ...base, icon: "👠", title: m.title || "Reward sent", detail: m.text, outcome: "neutral" };
    case "system":
      return { ...base, icon: "⚙️", title: "System", detail: m.text, outcome: "neutral" };
    case "refusal":
      return { ...base, icon: "⛔", title: "Refused by the engine", detail: m.text, outcome: "failed" };
    default:
      return null;
  }
}

const DOT = {
  pending: "border-amber-400/60 bg-amber-400/20",
  met: "border-emerald-400/60 bg-emerald-400/20",
  failed: "border-rose-400/60 bg-rose-400/20",
  neutral: "border-white/20 bg-white/10",
} as const;

const BADGE = {
  pending: { t: "Pending", c: "text-amber-300" },
  met: { t: "Met", c: "text-emerald-300" },
  failed: { t: "Failed", c: "text-rose-300" },
  neutral: { t: "", c: "" },
} as const;

export default function CommandLog({
  messages,
  title = "Command Log",
  limit = 40,
}: {
  messages: Msg[];
  title?: string;
  limit?: number;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "orders">("all");

  const entries = useMemo(() => {
    const all = messages
      .map(toEntry)
      .filter((e): e is Entry => Boolean(e))
      .sort((a, b) => b.at - a.at);
    const f =
      filter === "pending"
        ? all.filter((e) => e.outcome === "pending")
        : filter === "orders"
          ? all.filter((e) => e.by === "mistress")
          : all;
    return f.slice(0, limit);
  }, [messages, filter, limit]);

  const pendingCount = useMemo(
    () => messages.map(toEntry).filter((e) => e?.outcome === "pending").length,
    [messages]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="label">📜 {title}</span>
        {pendingCount > 0 && (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9.5px] text-amber-200">
            {pendingCount} open
          </span>
        )}
        <span className="flex-1" />
        {(["all", "pending", "orders"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[10.5px] capitalize transition ${
              filter === f ? "border-brass/50 bg-brass/12 text-brass-soft" : "border-white/10 text-white/40"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="thin-scroll max-h-[380px] overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-white/30">Nothing on record.</p>
        ) : (
          <ol className="relative px-4 py-3">
            {/* spine */}
            <span className="absolute top-4 bottom-4 left-[22px] w-px bg-gradient-to-b from-brass/30 via-white/10 to-transparent" />

            {entries.map((e) => (
              <li key={e.id} className="relative flex gap-3 py-2.5">
                <span
                  className={`relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${DOT[e.outcome]}`}
                >
                  {e.outcome === "pending" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px]">{e.icon}</span>
                    <span
                      className={`text-[12.5px] font-medium ${
                        e.by === "mistress" ? "text-brass-soft/90" : "text-white/75"
                      }`}
                    >
                      {e.title}
                    </span>
                    {BADGE[e.outcome].t && (
                      <span className={`font-mono text-[9px] tracking-[0.14em] uppercase ${BADGE[e.outcome].c}`}>
                        · {BADGE[e.outcome].t}
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="font-mono text-[9px] text-white/25">{ago(e.at)}</span>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-white/45">
                      <Linkify text={e.detail} />
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
