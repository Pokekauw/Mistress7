import { useRef, useState } from "react";
import { applyWheel, pickWheelSlice, WHEEL, type Slave } from "../lib/store";

const SIZE = 260;
const R = SIZE / 2;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(i: number, total: number) {
  const step = 360 / total;
  const a0 = i * step;
  const a1 = a0 + step;
  const p0 = polar(R, R, R - 4, a0);
  const p1 = polar(R, R, R - 4, a1);
  return `M ${R} ${R} L ${p0.x} ${p0.y} A ${R - 4} ${R - 4} 0 0 1 ${p1.x} ${p1.y} Z`;
}

export default function PunishmentWheel({
  slave,
  onClose,
  onResult,
}: {
  slave: Slave;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof applyWheel> | null>(null);
  const spins = useRef(0);

  const total = WHEEL.length;
  const step = 360 / total;

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    const idx = pickWheelSlice();
    /* land the middle of slice idx under the pointer at the top */
    const target = 360 * (5 + spins.current) + (360 - (idx * step + step / 2));
    spins.current += 1;
    setAngle(target);

    window.setTimeout(() => {
      const outcome = applyWheel(slave.id, idx);
      setResult(outcome);
      setSpinning(false);
      onResult(
        `🎡 ${outcome.slice.icon} ${outcome.slice.label}${
          outcome.devotion ? ` · ${outcome.devotion > 0 ? "+" : "−"}${Math.abs(outcome.devotion)} ♥` : ""
        }`
      );
    }, 4200);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 px-4 py-4 backdrop-blur-sm sm:items-center" onClick={() => !spinning && onClose()}>
      <div
        className="thin-scroll max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-brass/35 bg-gradient-to-b from-[#1c1118] to-[#0a070b] p-6 text-center shadow-[0_40px_120px_-20px_rgba(0,0,0,.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="label">🎡 Wheel of Punishment</div>
        <h3 className="font-display mt-1 text-[1.7rem] leading-tight text-white">
          Sentencing <span className="gold-text">{slave.name}</span>
        </h3>

        {/* wheel */}
        <div className="relative mx-auto mt-6" style={{ width: SIZE, maxWidth: "100%" }}>
          {/* pointer */}
          <div className="absolute left-1/2 -top-1 z-10 -translate-x-1/2">
            <div className="h-0 w-0 border-x-[10px] border-t-[18px] border-x-transparent border-t-brass drop-shadow" />
          </div>

          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full drop-shadow-[0_20px_50px_rgba(0,0,0,.8)]"
            style={{
              transform: `rotate(${angle}deg)`,
              transition: spinning ? "transform 4.1s cubic-bezier(.17,.67,.16,1)" : "none",
            }}
          >
            <circle cx={R} cy={R} r={R - 2} fill="#0a070b" stroke="rgba(201,162,39,.5)" strokeWidth="2" />
            {WHEEL.map((w, i) => {
              const mid = i * step + step / 2;
              const p = polar(R, R, R * 0.62, mid);
              return (
                <g key={w.id}>
                  <path d={slicePath(i, total)} fill={w.color} stroke="rgba(0,0,0,.5)" strokeWidth="1" />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="19"
                    transform={`rotate(${mid}, ${p.x}, ${p.y})`}
                  >
                    {w.icon}
                  </text>
                </g>
              );
            })}
            <circle cx={R} cy={R} r="26" fill="#140d12" stroke="rgba(201,162,39,.55)" strokeWidth="2" />
            <text x={R} y={R} textAnchor="middle" dominantBaseline="middle" fontSize="20">
              ⛓️
            </text>
          </svg>
        </div>

        {/* result */}
        {result ? (
          <div className="mt-6 rounded-xl border border-brass/40 bg-brass/10 p-4">
            <div className="text-[26px]">{result.slice.icon}</div>
            <div className="font-display mt-1 text-[1.35rem] leading-tight text-white">{result.slice.label}</div>
            {result.devotion !== 0 && (
              <div className={`mt-1.5 font-mono text-[12px] ${result.devotion > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {result.devotion > 0 ? "+" : "−"}
                {Math.abs(result.devotion)} devotion
                {result.doubled && <span className="ml-1.5 text-violet-300">×2 · chastity 🔒</span>}
              </div>
            )}
            <p className="mt-2 text-[11.5px] text-white/45">Recorded in {slave.name}'s history ⛓️</p>
          </div>
        ) : (
          <p className="mt-6 text-[12.5px] text-white/45">
            {spinning ? "The wheel is turning… ⏳" : "Eight outcomes. He has no say in any of them. 🖤"}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={spinning}
            className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60 disabled:opacity-40"
          >
            {result ? "Done" : "Cancel"}
          </button>
          <button
            onClick={spin}
            disabled={spinning}
            className="flex-1 rounded-lg border border-brass/55 bg-gradient-to-r from-brass/35 to-brass/15 py-3 text-[13px] font-medium text-brass-soft disabled:opacity-40"
          >
            {spinning ? "⏳ Spinning…" : result ? "Spin Again 🎡" : "Spin the Wheel 🎡"}
          </button>
        </div>
      </div>
    </div>
  );
}
