import { useEffect, useState } from "react";
import { adjustDevotion, rankOf, setDevotion, type Slave } from "../lib/store";

/**
 * Hybrid control. Points still accrue automatically from rituals, tributes
 * and judgements — this simply lets the Mistress overrule the arithmetic.
 */
export default function DevotionControl({ slave, onDone }: { slave: Slave; onDone?: (m: string) => void }) {
  const [draft, setDraft] = useState(slave.devotion);
  const dirty = draft !== slave.devotion;

  /* follow the live value unless she is mid-drag */
  useEffect(() => setDraft(slave.devotion), [slave.devotion]);

  const commit = (v: number) => {
    if (v === slave.devotion) return;
    setDevotion(slave.id, v);
    onDone?.(`${v > slave.devotion ? "🖤" : "💔"} Devotion set to ♥ ${v} · ${slave.name}`);
  };

  const step = (d: number) => {
    adjustDevotion(slave.id, d);
    onDone?.(`${d > 0 ? "🖤" : "💔"} Devotion ${d > 0 ? "+" : ""}${d} · ${slave.name}`);
  };

  return (
    <div className="rounded-xl border border-brass/25 bg-brass/[0.06] p-3.5">
      <div className="flex items-center gap-2">
        <span className="label">🖤 Devotion</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-white/40">{rankOf(draft)}</span>
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <button
          onClick={() => step(-5)}
          className="h-9 w-9 shrink-0 rounded-lg border border-rose-400/35 bg-rose-500/10 text-[15px] text-rose-200 transition active:scale-90 hover:bg-rose-500/20"
          title="−5"
        >
          −
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[1.7rem] leading-none gold-text">{draft}</span>
            {dirty && <span className="font-mono text-[10px] text-amber-300">release to apply</span>}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => commit(draft)}
            onKeyUp={() => commit(draft)}
            className="mt-2 w-full"
          />
        </div>

        <button
          onClick={() => step(5)}
          className="h-9 w-9 shrink-0 rounded-lg border border-emerald-400/35 bg-emerald-500/10 text-[15px] text-emerald-200 transition active:scale-90 hover:bg-emerald-500/20"
          title="+5"
        >
          ＋
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {[-25, -10, +10, +25].map((d) => (
          <button
            key={d}
            onClick={() => step(d)}
            className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] transition ${
              d < 0
                ? "border-rose-400/25 text-rose-200/80 hover:bg-rose-500/10"
                : "border-emerald-400/25 text-emerald-200/80 hover:bg-emerald-500/10"
            }`}
          >
            {d > 0 ? "+" : ""}
            {d}
          </button>
        ))}
        <span className="flex-1" />
        <span className="self-center font-mono text-[9.5px] text-white/25">points still accrue automatically</span>
      </div>
    </div>
  );
}
