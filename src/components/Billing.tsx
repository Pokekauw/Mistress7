import { useState } from "react";
import { rosterCapacity, setPlan, useStore } from "../lib/store";
import { FEATURE_LABEL, kr, PLANS, planOf, type Feature, type PlanId } from "../lib/plans";

const ALL_FEATURES: Feature[] = ["location", "media", "wheel", "batch", "telegram", "branding", "ledger"];

export default function Billing() {
  const dungeon = useStore((s) => s.dungeon);
  const slaves = useStore((s) => s.slaves);
  const [confirm, setConfirm] = useState<PlanId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const active = planOf(dungeon.plan);
  const cap = rosterCapacity();
  const pct = cap.max === null ? 0 : Math.min(100, Math.round((cap.used / cap.max) * 100));

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  return (
    <div className="space-y-5 p-5">
      {/* ---------- current standing ---------- */}
      <div className="relative overflow-hidden rounded-2xl border border-brass/30 bg-gradient-to-br from-brass/12 via-oxblood/8 to-transparent p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brass/12 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label">💳 Your subscription</div>
            <h2 className="font-display mt-2 text-[2.1rem] leading-none text-white md:text-[2.6rem]">
              <span className="gold-text">{active.name}</span>
            </h2>
            <p className="mt-2 text-[13.5px] text-white/55 italic">{active.tagline}</p>
          </div>
          <div className="text-right">
            <div className="font-display text-[2.4rem] leading-none gold-text">{kr(active.price)}</div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">per month</div>
          </div>
        </div>

        {/* the promise */}
        <div className="relative mt-6 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="text-[18px]">🖤</span>
            <div>
              <div className="text-[13.5px] font-medium text-emerald-100">
                100% of every tribute is yours.
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-white/55">
                This platform takes a flat monthly fee and nothing else. No commission, no percentage, no cut of
                what passes between you and those you own. Money moves directly from him to you.
              </p>
            </div>
          </div>
        </div>

        {/* roster usage */}
        <div className="relative mt-4">
          <div className="flex items-baseline justify-between">
            <span className="label">Roster</span>
            <span className="font-mono text-[11.5px] text-white/60">
              {cap.used} / {cap.max === null ? "∞" : cap.max}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full transition-all ${
                pct >= 100 ? "bg-rose-400/80" : pct > 75 ? "bg-amber-400/70" : "bg-gradient-to-r from-brass to-brass/40"
              }`}
              style={{ width: cap.max === null ? "12%" : `${Math.max(3, pct)}%` }}
            />
          </div>
          {!cap.ok && (
            <p className="mt-2 text-[11.5px] text-rose-300">
              Your house is full. Raise your plan to admit more. ⛓️
            </p>
          )}
        </div>
      </div>

      {/* ---------- plans ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isActive = p.id === active.id;
          const tooSmall = p.maxSlaves !== null && slaves.length > p.maxSlaves;
          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-2xl border p-6 transition ${
                isActive
                  ? "border-brass/60 bg-gradient-to-b from-brass/14 to-transparent"
                  : p.featured
                    ? "border-brass/30 bg-white/[0.03]"
                    : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {isActive && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-brass/55 bg-[#160e14] px-3 py-0.5 font-mono text-[9px] tracking-[0.2em] text-brass-soft uppercase">
                  Active
                </span>
              )}
              {!isActive && p.featured && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-[#160e14] px-3 py-0.5 font-mono text-[9px] tracking-[0.2em] text-white/50 uppercase">
                  Most chosen
                </span>
              )}

              <h3 className="font-display text-[1.5rem] text-white">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`font-display text-[2.2rem] leading-none ${isActive ? "gold-text" : "text-white/80"}`}>
                  {p.price}
                </span>
                <span className="text-[12px] text-white/40">kr./md.</span>
              </div>
              <p className="mt-2 text-[12px] text-white/45 italic">{p.tagline}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {p.perks.map((t) => (
                  <li key={t} className="flex gap-2 text-[12.5px] leading-snug text-white/65">
                    <span className="mt-0.5 text-brass/70">✦</span>
                    {t}
                  </li>
                ))}
              </ul>

              <button
                disabled={isActive || tooSmall}
                onClick={() => setConfirm(p.id)}
                className={`mt-5 w-full rounded-xl py-3 text-[13px] font-medium transition ${
                  isActive
                    ? "cursor-default border border-brass/30 text-brass-soft/60"
                    : tooSmall
                      ? "cursor-not-allowed border border-white/8 text-white/25"
                      : "border border-brass/50 bg-gradient-to-r from-brass/28 to-brass/10 text-brass-soft hover:from-brass/45"
                }`}
              >
                {isActive ? "Current plan" : tooSmall ? `Too small — ${slaves.length} in service` : "Switch to this"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ---------- capability matrix ---------- */}
      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-3">
          <div className="label">What each plan unlocks</div>
        </div>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[460px] text-left">
            <thead>
              <tr className="border-b border-white/6">
                <th className="px-5 py-2.5 text-[11px] font-normal text-white/35">Capability</th>
                {PLANS.map((p) => (
                  <th
                    key={p.id}
                    className={`px-3 py-2.5 text-center font-mono text-[10px] tracking-[0.12em] uppercase ${
                      p.id === active.id ? "text-brass-soft" : "text-white/35"
                    }`}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              <tr>
                <td className="px-5 py-2.5 text-[12.5px] text-white/70">⛓️ Submissives</td>
                {PLANS.map((p) => (
                  <td key={p.id} className="px-3 py-2.5 text-center font-mono text-[11.5px] text-white/60">
                    {p.maxSlaves === null ? "∞" : p.maxSlaves}
                  </td>
                ))}
              </tr>
              {ALL_FEATURES.map((f) => (
                <tr key={f}>
                  <td className="px-5 py-2.5 text-[12.5px] text-white/70">{FEATURE_LABEL[f]}</td>
                  {PLANS.map((p) => (
                    <td key={p.id} className="px-3 py-2.5 text-center">
                      {p.features.includes(f) ? (
                        <span className="text-[12px] text-emerald-300">✓</span>
                      ) : (
                        <span className="text-[12px] text-white/15">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-5 py-2.5 text-[12.5px] text-white/70">💰 Commission on tribute</td>
                {PLANS.map((p) => (
                  <td key={p.id} className="px-3 py-2.5 text-center font-mono text-[11px] text-emerald-300">
                    0%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- confirm ---------- */}
      {confirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-brass/35 bg-gradient-to-b from-[#1c1118] to-[#0a070b] p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="label">Change subscription</div>
            <h3 className="font-display mt-2 text-[1.8rem] leading-tight text-white">{planOf(confirm).name}</h3>
            <div className="mt-2 font-display text-[2.2rem] leading-none gold-text">{kr(planOf(confirm).price)}</div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">per month</div>

            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-white/50">
              Demo environment — no payment is taken. In production this hands off to your payment provider before
              the plan changes.
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
                Cancel
              </button>
              <button
                onClick={() => {
                  setPlan(confirm);
                  flash(`💳 Now on ${planOf(confirm).name} · ${kr(planOf(confirm).price)}/md.`);
                  setConfirm(null);
                }}
                className="flex-1 rounded-lg border border-brass/55 bg-gradient-to-r from-brass/35 to-brass/15 py-3 text-[13px] font-medium text-brass-soft"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border border-brass/40 bg-[#140d12]/95 px-5 py-2.5 text-[12.5px] text-brass-soft backdrop-blur-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
