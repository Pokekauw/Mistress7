import { useEffect, useRef, useState } from "react";
import { clearCondition, extendCondition, penaliseExpiry, type Slave } from "../lib/store";

const EXTEND = [10, 30, 60, 240, 720, 1440];

function label(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ConditionTimer({
  slave,
  what,
  canControl = true,
}: {
  slave: Slave;
  what: "gag" | "lock";
  canControl?: boolean;
}) {
  const until = what === "gag" ? slave.gagUntil : slave.lockUntil;
  const [, tick] = useState(0);
  const [expired, setExpired] = useState(false);
  const [open, setOpen] = useState(false);
  const spanRef = useRef<number>(0);
  const firedRef = useRef<number>(0);

  /* remember the full span so the ring can show progress */
  useEffect(() => {
    if (until > Date.now()) {
      const remaining = until - Date.now();
      if (remaining > spanRef.current) spanRef.current = remaining;
      setExpired(false);
    }
  }, [until]);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const left = until - Date.now();
  const active = left > 0;

  /* fire the penalty exactly once per countdown */
  useEffect(() => {
    if (!active && until > 0 && firedRef.current !== until) {
      firedRef.current = until;
      setExpired(true);
      penaliseExpiry(slave.id, what);
    }
  }, [active, until, slave.id, what]);

  const icon = what === "gag" ? "🤐" : "🔒";
  const name = what === "gag" ? "Gag" : "Chastity";
  const pct = active && spanRef.current > 0 ? Math.max(0, Math.min(1, left / spanRef.current)) : 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  const accent = what === "gag" ? "#fbbf24" : "#a78bfa";

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        active
          ? what === "gag"
            ? "border-amber-400/40 bg-amber-500/8"
            : "border-violet-400/40 bg-violet-500/8"
          : expired
            ? "border-rose-400/45 bg-rose-500/8"
            : "border-white/10 bg-white/[0.025]"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* ring */}
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4" />
            {active && (
              <circle
                cx="32"
                cy="32"
                r={R}
                fill="none"
                stroke={accent}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct)}
                style={{ transition: "stroke-dashoffset .5s linear" }}
              />
            )}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[17px]">{icon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="label">{name}</div>
          {active ? (
            <div className="font-mono text-[1.45rem] leading-tight text-white tabular-nums">{label(left)}</div>
          ) : expired ? (
            <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-rose-400/45 bg-rose-500/15 px-2.5 py-1 text-[10.5px] font-medium text-rose-100">
              ⏳ Expired — Penalty Applied
            </div>
          ) : (
            <div className="font-display text-[1.05rem] text-white/35">Not Active</div>
          )}
        </div>
      </div>

      {canControl && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-white/12 px-2.5 py-1.5 text-[11px] text-white/65 transition hover:border-brass/45 hover:text-brass-soft"
          >
            {active ? "＋ Extend" : "▶ Impose"}
          </button>
          {active && (
            <button
              onClick={() => {
                clearCondition(slave.id, what);
                setExpired(false);
              }}
              className="rounded-md border border-emerald-400/35 bg-emerald-500/8 px-2.5 py-1.5 text-[11px] text-emerald-200"
            >
              🕊️ Release Early
            </button>
          )}
          {expired && !active && (
            <button
              onClick={() => {
                extendCondition(slave.id, what, 60);
                setExpired(false);
              }}
              className="rounded-md border border-brass/45 bg-brass/12 px-2.5 py-1.5 text-[11px] text-brass-soft"
            >
              ↻ Reimpose · 1h
            </button>
          )}
        </div>
      )}

      {open && canControl && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {EXTEND.map((m) => (
            <button
              key={m}
              onClick={() => {
                extendCondition(slave.id, what, m);
                setExpired(false);
                setOpen(false);
              }}
              className="rounded-md border border-white/10 py-1.5 text-[10.5px] text-white/60 transition hover:border-brass/45 hover:text-brass-soft"
            >
              +{m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
