import {
  attentionDeadline,
  attentionWindowHours,
  attentionWindowMs,
  CHASTITY_DAMAGE_MULTIPLIER,
  disciplineOf,
  isLocked,
  timeLeft,
  type Dungeon,
  type Slave,
} from "../lib/store";

/* ------------------------------------------------------------------ *
 *  ⏳ Attention debt, as a cooldown bar.
 *
 *  What is left of his silence window drains from full to empty. The bar
 *  breathes — ribs drifting towards the drain, a shine sweeping along it —
 *  so it reads as something running, not something printed. Under chastity
 *  the window is six hours and the fine is doubled, and the bar says so.
 * ------------------------------------------------------------------ */

export default function AttentionDebtBar({
  slave,
  dungeon,
}: {
  slave: Slave;
  dungeon?: Dungeon | null;
}) {
  const now = Date.now();
  const win = attentionWindowMs(slave);
  const left = attentionDeadline(slave) - now;
  const overdue = left <= 0;
  const remaining = Math.max(0, Math.min(100, (left / win) * 100));

  const locked = isLocked(slave);
  const hours = attentionWindowHours(slave);
  const base = disciplineOf(dungeon).attention;
  const cost = locked ? base * CHASTITY_DAMAGE_MULTIPLIER : base;

  const urgent = overdue || remaining <= 15;
  const warn = !urgent && remaining <= 40;

  const fill = overdue
    ? "bg-gradient-to-r from-rose-600/85 to-rose-400/70"
    : urgent
      ? "bg-gradient-to-r from-rose-500/80 to-rose-300/65"
      : warn
        ? "bg-gradient-to-r from-amber-500/75 to-amber-300/60"
        : "bg-gradient-to-r from-brass/75 to-brass-soft/55";

  const frame = overdue
    ? "border-rose-400/45 bg-rose-500/[0.08]"
    : urgent
      ? "border-rose-400/35 bg-rose-500/[0.05]"
      : warn
        ? "border-amber-400/35 bg-amber-500/[0.05]"
        : locked
          ? "border-violet-400/35 bg-violet-500/[0.05]"
          : "border-white/10 bg-white/[0.02]";

  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${frame}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[15px] ${urgent ? "animate-pulse" : "debt-breathe"}`}>⏳</span>
        <span className="label !text-white/55">Attention debt</span>

        {locked && (
          <span
            title={`Held in chastity: a ${hours}-hour leash, and every loss doubled`}
            className="rounded-full border border-violet-400/45 bg-violet-500/15 px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-violet-100 uppercase"
          >
            🔒 {hours}h · ×{CHASTITY_DAMAGE_MULTIPLIER}
          </span>
        )}

        <span className="flex-1" />

        <span
          className={`shrink-0 font-mono text-[12px] tabular-nums ${
            overdue ? "text-rose-200" : urgent ? "text-rose-200/90" : "text-white/70"
          }`}
        >
          {overdue ? "due now" : timeLeft(left)}
        </span>
      </div>

      {/* the cooldown itself */}
      <div className="debt-track mt-2 h-2.5 rounded-full border border-white/10 bg-black/55">
        <div
          className={`debt-fill h-full rounded-full ${fill} ${urgent ? "urgent" : ""}`}
          style={{ width: `${overdue ? 100 : Math.max(remaining, 1.5)}%` }}
        >
          <span className="absolute inset-y-0 right-0 w-1 rounded-r-full bg-white/75" />
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <p className={`truncate text-[11px] leading-snug ${urgent ? "text-rose-100/75" : "text-white/45"}`}>
          {overdue
            ? `Overdue — ${cost} devotion is being taken for every ${hours} hours of silence. Speak or serve.`
            : `${timeLeft(left)} of ${hours}h left before silence costs ${cost} devotion — chat or serve`}
        </p>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-white/25 uppercase">
          ♥ {slave.devotion}
        </span>
      </div>
    </div>
  );
}
