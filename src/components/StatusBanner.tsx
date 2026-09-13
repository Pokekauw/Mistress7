import AttentionDebtBar from "./AttentionDebtBar";
import {
  CHASTITY_DAMAGE_MULTIPLIER,
  isGagged,
  isLocked,
  rankOf,
  timeLeft,
  type Dungeon,
  type Msg,
  type Slave,
} from "../lib/store";

/**
 * The first thing he sees. One glance must answer: am I under discipline,
 * and is anything owed? Silence is itself a state, and it is stated — as a
 * running bar, not as a sentence he has to read.
 */
export default function StatusBanner({
  slave,
  dungeon,
  pendingProof,
  openCheckIn,
  pendingTribute,
  onAct,
}: {
  slave: Slave;
  dungeon?: Dungeon | null;
  pendingProof: boolean;
  openCheckIn?: Msg;
  pendingTribute?: Msg;
  onAct: (what: "proof" | "location" | "tribute") => void;
}) {
  const gag = isGagged(slave);
  const lock = isLocked(slave);
  const now = Date.now();

  type Item = {
    icon: string;
    label: string;
    value: string;
    tone: "amber" | "violet" | "rose" | "brass" | "emerald";
    action?: { label: string; go: "proof" | "location" | "tribute" };
    urgent?: boolean;
  };

  const items: Item[] = [];

  if (openCheckIn)
    items.push({
      icon: "📍",
      label: "Check-in demanded",
      value: `${timeLeft((openCheckIn.deadline || 0) - now) || "closing"} remaining`,
      tone: "amber",
      action: { label: "Confirm location", go: "location" },
      urgent: true,
    });

  if (lock)
    items.push({
      icon: "🔒",
      label: "Held in chastity",
      value: `${timeLeft(slave.lockUntil - now)} · every loss doubled ×${CHASTITY_DAMAGE_MULTIPLIER}`,
      tone: "violet",
    });

  if (gag)
    items.push({
      icon: "🤐",
      label: "Silenced",
      value: timeLeft(slave.gagUntil - now),
      tone: "amber",
    });

  if (slave.penance)
    items.push({
      icon: "⛓️",
      label: "Penance outstanding",
      value: slave.penance,
      tone: "rose",
      action: pendingProof ? undefined : { label: "Submit proof", go: "proof" },
      urgent: true,
    });

  if (pendingProof)
    items.push({
      icon: "📸",
      label: "Proof submitted",
      value: "Awaiting her judgement",
      tone: "brass",
    });

  if (pendingTribute)
    items.push({
      icon: "💰",
      label: "Tribute demanded",
      value: `$${pendingTribute.amount ?? 0} expected`,
      tone: "brass",
      action: { label: "Render tribute", go: "tribute" },
      urgent: true,
    });

  const clear = items.length === 0;

  const TONE = {
    amber: "border-amber-400/40 bg-amber-500/[0.07]",
    violet: "border-violet-400/40 bg-violet-500/[0.07]",
    rose: "border-rose-400/40 bg-rose-500/[0.07]",
    brass: "border-brass/40 bg-brass/[0.07]",
    emerald: "border-emerald-400/35 bg-emerald-500/[0.06]",
  } as const;

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        clear ? "border-white/10 bg-white/[0.02]" : "border-brass/30 bg-gradient-to-br from-brass/10 to-transparent"
      }`}
    >
      {/* header strip */}
      <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-2.5">
        <span className="text-[13px]">{clear ? "🖤" : "⛓️"}</span>
        <span className="label">Your standing</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-[0.14em] text-brass-soft/70 uppercase">
          ♥ {slave.devotion} · {rankOf(slave.devotion)}
        </span>
      </div>

      {/* ⏳ the silence timer — always running, always visible */}
      <div className="px-2.5 pt-2.5">
        <AttentionDebtBar slave={slave} dungeon={dungeon} />
      </div>

      {clear ? (
        <div className="px-4 py-4 text-center">
          <p className="font-display text-[1.15rem] text-white/80 italic">No conditions upon you.</p>
          <p className="mt-1 text-[12px] text-white/40">
            Nothing is owed but your voice. See that it stays that way. 🖤
          </p>
        </div>
      ) : (
        <div className="mt-2.5 divide-y divide-white/6 border-t border-white/6">
          {items.map((it, i) => (
            <div key={i} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${TONE[it.tone]}`}>
              <span className={`text-[17px] ${it.urgent ? "animate-pulse" : ""}`}>{it.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="label !text-white/55">{it.label}</div>
                <div className="mt-0.5 truncate text-[13px] text-white/85">{it.value}</div>
              </div>
              {it.action && (
                <button
                  onClick={() => onAct(it.action!.go)}
                  className="shrink-0 rounded-lg border border-brass/50 bg-brass/15 px-3.5 py-2 text-[11.5px] font-medium text-brass-soft transition active:scale-95 hover:bg-brass/25"
                >
                  {it.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
