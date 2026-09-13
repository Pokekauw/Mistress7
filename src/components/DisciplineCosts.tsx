import { useEffect, useRef, useState } from "react";
import {
  CHASTITY_DAMAGE_MULTIPLIER,
  defaultDiscipline,
  disciplineOf,
  IMPLEMENTS,
  resetDiscipline,
  setDiscipline,
  useStore,
  WHEEL,
  type DisciplineCosts,
} from "../lib/store";

/* ------------------------------------------------------------------ *
 *  ⚖️ What a strike costs.
 *
 *  Every price the engine charges is hers to set. The defaults are the
 *  values the house has always used, so she can simply lower the ones
 *  that hit too hard — a whipping that corrects, instead of one that
 *  flattens his devotion for a week.
 * ------------------------------------------------------------------ */

const MIN = 0;
const MAX = 100;
const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Math.round(n)));

function Stepper({
  value,
  onChange,
  defaultValue,
  onReset,
  sign = "−",
}: {
  value: number;
  onChange: (n: number) => void;
  defaultValue: number;
  onReset: () => void;
  sign?: string;
}) {
  const changed = value !== defaultValue;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {changed && (
        <button
          onClick={onReset}
          title={`House default: ${sign}${defaultValue}`}
          className="rounded-md border border-white/12 px-1.5 py-1 font-mono text-[10px] text-white/45 transition hover:border-brass/50 hover:text-brass-soft"
        >
          ↺
        </button>
      )}
      <button
        onClick={() => onChange(clamp(value - 1))}
        className="h-7 w-7 rounded-md border border-white/12 text-[13px] leading-none text-white/60 transition hover:border-rose-400/50 hover:text-rose-200"
        title="One less"
      >
        −
      </button>
      <span className="flex items-center gap-0.5 rounded-md border border-rose-400/25 bg-rose-500/[0.07] px-1.5 py-1">
        <span className="font-mono text-[10px] text-rose-200/70">{sign}</span>
        <input
          type="number"
          min={MIN}
          max={MAX}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          className="w-9 bg-transparent text-center font-mono text-[12.5px] text-white/90 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="font-mono text-[10px] text-brass-soft/70">♥</span>
      </span>
      <button
        onClick={() => onChange(clamp(value + 1))}
        className="h-7 w-7 rounded-md border border-white/12 text-[13px] leading-none text-white/60 transition hover:border-rose-400/50 hover:text-rose-200"
        title="One more"
      >
        +
      </button>
    </div>
  );
}

function Row({
  icon,
  label,
  hint,
  chastity,
  children,
}: {
  icon: string;
  label: string;
  hint?: string;
  /** what he pays while locked, shown as a ghost figure */
  chastity?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
      <span className="shrink-0 text-[17px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-white/80">{label}</div>
        {hint && <div className="truncate text-[10.5px] text-white/35 italic">{hint}</div>}
      </div>
      {typeof chastity === "number" && chastity > 0 && (
        <span
          className="hidden shrink-0 font-mono text-[9.5px] tracking-[0.08em] text-violet-200/70 sm:block"
          title={`Doubled to −${chastity} ♥ while he is held in chastity`}
        >
          🔒 −{chastity}
        </span>
      )}
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="label mt-5 mb-2 first:mt-0">{children}</div>;
}

export default function DisciplineCosts() {
  const dungeon = useStore((s) => s.dungeon);
  const live = disciplineOf(dungeon);
  const defaults = defaultDiscipline();

  /* her edits are held locally and committed a beat later, so a burst of
     clicks lands as one change rather than a dozen writes */
  const [draft, setDraft] = useState<DisciplineCosts>(live);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  const liveKey = JSON.stringify(live);

  useEffect(() => {
    /* another device may rewrite the table — adopt it unless she is mid-edit */
    if (!timer.current) setDraft(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const commit = (next: DisciplineCosts) => {
    setDraft(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setDiscipline(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    }, 650);
  };

  const setImpl = (id: string, v: number) =>
    commit({ ...draft, implements: { ...draft.implements, [id]: v } });
  const setWheel = (id: string, v: number) => commit({ ...draft, wheel: { ...draft.wheel, [id]: v } });
  const setField = (k: "quickStrike" | "attention" | "missedCheckIn" | "proofRejected", v: number) =>
    commit({ ...draft, [k]: v });

  const wheelRows = WHEEL.filter((w) => (defaults.wheel[w.id] ?? 0) !== 0);

  return (
    <div className="card rounded-xl p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-400/35 bg-rose-500/10 text-[20px]">
          ⚖️
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.5rem] leading-tight text-white">Discipline costs</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
            How much devotion each kind of strike takes. The numbers below are the house defaults — lower any of them
            and the change applies at once, to every submissive, on every device.
          </p>
        </div>
        <button
          onClick={() => {
            if (timer.current) {
              window.clearTimeout(timer.current);
              timer.current = null;
            }
            resetDiscipline();
            setDraft(defaultDiscipline());
            setSaved(true);
            window.setTimeout(() => setSaved(false), 1600);
          }}
          className="shrink-0 rounded-lg border border-white/12 px-3 py-2 text-[11.5px] text-white/55 transition hover:border-brass/50 hover:text-brass-soft"
        >
          {saved ? "Saved ✓" : "↺ Defaults"}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-violet-400/30 bg-violet-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-violet-100/80">
        🔒 A submissive held in chastity is on <span className="font-medium">double damage</span>: every loss below
        costs him ×{CHASTITY_DAMAGE_MULTIPLIER}, and his attention-debt window shortens to six hours. Rewards are never
        doubled.
      </div>

      <SectionTitle>💥 Strike instruments · per stroke</SectionTitle>
      <div className="space-y-1.5">
        {IMPLEMENTS.map((i) => {
          const v = draft.implements[i.id] ?? defaults.implements[i.id] ?? 0;
          return (
            <Row key={i.id} icon={i.icon} label={i.label} hint={i.blurb} chastity={v * CHASTITY_DAMAGE_MULTIPLIER}>
              <Stepper
                value={v}
                defaultValue={defaults.implements[i.id] ?? i.cost}
                onChange={(n) => setImpl(i.id, n)}
                onReset={() => setImpl(i.id, defaults.implements[i.id] ?? i.cost)}
              />
            </Row>
          );
        })}
      </div>

      <SectionTitle>⛓️ Orders &amp; automatic fines</SectionTitle>
      <div className="space-y-1.5">
        <Row
          icon="💥"
          label="Quick strike"
          hint="The Strike command on the deck — one strike on his record"
          chastity={draft.quickStrike * CHASTITY_DAMAGE_MULTIPLIER}
        >
          <Stepper
            value={draft.quickStrike}
            defaultValue={defaults.quickStrike}
            onChange={(n) => setField("quickStrike", n)}
            onReset={() => setField("quickStrike", defaults.quickStrike)}
          />
        </Row>
        <Row
          icon="⏳"
          label="Attention debt"
          hint="Every silence window that expires unanswered"
          chastity={draft.attention * CHASTITY_DAMAGE_MULTIPLIER}
        >
          <Stepper
            value={draft.attention}
            defaultValue={defaults.attention}
            onChange={(n) => setField("attention", n)}
            onReset={() => setField("attention", defaults.attention)}
          />
        </Row>
        <Row
          icon="📍"
          label="Missed check-in"
          hint="A location window that closed without an answer"
          chastity={draft.missedCheckIn * CHASTITY_DAMAGE_MULTIPLIER}
        >
          <Stepper
            value={draft.missedCheckIn}
            defaultValue={defaults.missedCheckIn}
            onChange={(n) => setField("missedCheckIn", n)}
            onReset={() => setField("missedCheckIn", defaults.missedCheckIn)}
          />
        </Row>
        <Row
          icon="📸"
          label="Proof rejected"
          hint="When you reject what he sent — one strike as well"
          chastity={draft.proofRejected * CHASTITY_DAMAGE_MULTIPLIER}
        >
          <Stepper
            value={draft.proofRejected}
            defaultValue={defaults.proofRejected}
            onChange={(n) => setField("proofRejected", n)}
            onReset={() => setField("proofRejected", defaults.proofRejected)}
          />
        </Row>
      </div>

      <SectionTitle>🎡 Wheel of punishment</SectionTitle>
      <div className="space-y-1.5">
        {wheelRows.map((w) => {
          const def = defaults.wheel[w.id] ?? w.devotion;
          const grants = def > 0;
          const v = Math.abs(draft.wheel[w.id] ?? def);
          return (
            <Row
              key={w.id}
              icon={w.icon}
              label={w.label}
              hint={grants ? "Devotion granted" : "Devotion taken"}
              chastity={grants ? undefined : v * CHASTITY_DAMAGE_MULTIPLIER}
            >
              <Stepper
                value={v}
                defaultValue={Math.abs(def)}
                sign={grants ? "+" : "−"}
                onChange={(n) => setWheel(w.id, grants ? n : -n)}
                onReset={() => setWheel(w.id, def)}
              />
            </Row>
          );
        })}
      </div>

      <p className="mt-4 text-[10.5px] leading-relaxed text-white/30">
        Nothing here changes what has already been taken. Costs apply from the next strike onwards, and every charge is
        written into his discipline record with the exact figure.
      </p>
    </div>
  );
}
