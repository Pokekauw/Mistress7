import { useState } from "react";
import { disciplineOf, IMPLEMENTS, isLocked, strikeWith, useStore, type ImplementId } from "../lib/store";

export default function StrikeModal({
  targets,
  targetNames,
  onClose,
  onDone,
}: {
  targets: string[];
  targetNames: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [pick, setPick] = useState<ImplementId>("crop");
  const [count, setCount] = useState(1);

  /* what THIS house charges per stroke — she sets it under House → Discipline */
  const dungeon = useStore((s) => s.dungeon);
  const slaves = useStore((s) => s.slaves);
  const costs = disciplineOf(dungeon);

  const impl = IMPLEMENTS.find((i) => i.id === pick)!;
  const perStroke = costs.implements[pick] ?? impl.cost;
  const base = perStroke * count;

  /* a slave in chastity pays double — say so before she swings */
  const lockedNames = slaves.filter((x) => targets.includes(x.id) && isLocked(x)).map((x) => x.name);
  const doubled = lockedNames.length > 0;
  const worst = doubled ? base * 2 : base;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 px-4 py-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="thin-scroll max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-rose-400/30 bg-gradient-to-b from-[#1e1016] to-[#0a070b] p-6 shadow-[0_40px_120px_-20px_rgba(0,0,0,.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-400/35 bg-rose-500/10 text-[20px]">💥</span>
          <div>
            <div className="label">Select your instrument</div>
            <div className="font-display text-[1.5rem] leading-none text-white">Administer Strike</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] text-white/55">
          Recipient: <span className="text-rose-200">{targetNames}</span>
        </div>

        <div className="mt-5 space-y-2">
          {IMPLEMENTS.map((i) => {
            const on = i.id === pick;
            const cost = costs.implements[i.id] ?? i.cost;
            return (
              <button
                key={i.id}
                onClick={() => setPick(i.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  on ? "border-rose-400/55 bg-rose-500/12" : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="text-[22px]">{i.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] font-medium ${on ? "text-white" : "text-white/80"}`}>{i.label}</span>
                  <span className="block truncate text-[11.5px] text-white/45 italic">{i.blurb}</span>
                </span>
                <span className="shrink-0 rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 py-1 font-mono text-[10.5px] text-rose-200">
                  −{cost} ♥
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
          These prices are yours — change them any time under{" "}
          <span className="text-brass-soft/70">House → Discipline costs</span>.
        </p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="label">Strokes</span>
            <span className="font-mono text-[13px] text-rose-200">×{count}</span>
          </div>
          <input type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full" />
        </div>

        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/25 px-4 py-3 text-center">
          <div className="label !text-rose-200/70">Devotion Forfeited</div>
          <div className="font-display mt-0.5 text-[2rem] leading-none text-rose-100">−{base} ♥</div>
          <div className="mt-1 font-mono text-[10.5px] text-white/40">
            {impl.icon} {impl.label} · {perStroke} ♥ × {count} · recorded in history ⛓️
          </div>
          {doubled && (
            <div className="mt-2 rounded-lg border border-violet-400/40 bg-violet-500/12 px-3 py-2 text-[11.5px] leading-snug text-violet-100">
              🔒 <span className="font-medium">{lockedNames.join(", ")}</span> is held in chastity — every loss is
              doubled: <span className="font-mono">−{worst} ♥</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
            Cancel
          </button>
          <button
            onClick={() => {
              const r = strikeWith(targets, pick, count);
              const taken = r.results.reduce((n, x) => n + x.taken, 0);
              onDone(
                `💥 Mistress Strikes: ${targetNames} · ${impl.label} ×${count} · −${taken} ♥${
                  r.results.some((x) => x.doubled) ? " · doubled in chastity 🔒" : ""
                }`
              );
              onClose();
            }}
            className="flex-1 rounded-lg border border-rose-400/50 bg-gradient-to-r from-rose-600/35 to-rose-600/15 py-3 text-[13px] font-medium text-rose-100"
          >
            Administer 💥
          </button>
        </div>
      </div>
    </div>
  );
}
