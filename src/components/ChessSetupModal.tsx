import { useState } from "react";

type Props = {
  onClose: () => void;
  onStart: (opts: { mistressColor: "w" | "b"; minutes: number; increment: number }) => void;
  /** who she is playing */
  slaveName: string;
};

const PRESETS = [
  { label: "Bullet 1+0", m: 1, inc: 0 },
  { label: "Bullet 2+1", m: 2, inc: 1 },
  { label: "Blitz 5+3", m: 5, inc: 3 },
  { label: "Blitz 10+0", m: 10, inc: 0 },
  { label: "Rapid 15+10", m: 15, inc: 10 },
  { label: "Classical 30+0", m: 30, inc: 0 },
];

export default function ChessSetupModal({ onClose, onStart, slaveName }: Props) {
  const [mistressColor, setMistressColor] = useState<"w" | "b">("w");
  const [minutes, setMinutes] = useState(10);
  const [increment, setIncrement] = useState(3);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/75 px-4 py-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="thin-scroll max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-brass/30 bg-gradient-to-b from-[#1a1016] to-[#0b0709] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[20px]">
            ♞
          </span>
          <div>
            <div className="label">Game Time</div>
            <div className="font-display text-[1.5rem] leading-none text-white">
              Chess
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] text-white/55">
          Opponent: <span className="text-brass-soft">{slaveName}</span>
          <div className="mt-0.5 text-white/40">Divine pieces against dull steel. Play hard. He won't win.</div>
        </div>

        {/* Colour */}
        <div className="label mt-5">She plays</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMistressColor("w")}
            className={`rounded-lg border px-3 py-3 text-[12.5px] transition ${
              mistressColor === "w"
                ? "border-pink-400/60 bg-pink-500/15 text-pink-100"
                : "border-white/10 text-white/55 hover:border-white/25"
            }`}
          >
            <div className="text-[20px] leading-none">♔</div>
            <div className="mt-1">Pink / White</div>
            <div className="font-mono text-[9.5px] text-white/40">divine rose side</div>
          </button>
          <button
            onClick={() => setMistressColor("b")}
            className={`rounded-lg border px-3 py-3 text-[12.5px] transition ${
              mistressColor === "b"
                ? "border-brass/60 bg-brass/15 text-brass-soft"
                : "border-white/10 text-white/55 hover:border-white/25"
            }`}
          >
            <div className="text-[20px] leading-none">♚</div>
            <div className="mt-1">Gold / Black</div>
            <div className="font-mono text-[9.5px] text-white/40">divine obsidian side</div>
          </button>
        </div>

        {/* Time presets */}
        <div className="label mt-5">Time control</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setMinutes(p.m);
                setIncrement(p.inc);
              }}
              className={`rounded-md border py-2 text-[11.5px] transition ${
                minutes === p.m && increment === p.inc
                  ? "border-brass/60 bg-brass/15 text-brass-soft"
                  : "border-white/10 text-white/55 hover:border-brass/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom sliders */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <div className="label">Minutes per side</div>
            <div className="mt-2 text-center font-display text-[1.5rem] text-brass-soft">{minutes}</div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <div className="label">Increment (s)</div>
            <div className="mt-2 text-center font-display text-[1.5rem] text-brass-soft">{increment}</div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={increment}
              onChange={(e) => setIncrement(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
            Cancel
          </button>
          <button
            onClick={() => onStart({ mistressColor, minutes, increment })}
            className="flex-1 rounded-lg border border-brass/50 bg-gradient-to-r from-brass/25 to-brass/10 py-3 text-[13px] font-medium text-brass-soft"
          >
            ♞ Begin Game
          </button>
        </div>
      </div>
    </div>
  );
}
