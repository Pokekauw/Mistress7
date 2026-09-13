import { useState } from "react";
import { mapLinks, type Fix, type Msg } from "../lib/store";
import ChatAction from "./ChatAction";

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function LocationCard({ fix, compact = false }: { fix: Fix; compact?: boolean }) {
  const { embed, open } = mapLinks(fix.lat, fix.lng);

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06]">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[13px]">📍</span>
        <span className="label !text-emerald-200/75">Location pinned</span>
        <span className="flex-1" />
        <span className="font-mono text-[9.5px] text-white/40">{ago(fix.at)}</span>
      </div>

      <div className={`relative w-full ${compact ? "h-32" : "h-44"} bg-black/40`}>
        <iframe
          title="map"
          src={embed}
          loading="lazy"
          className="h-full w-full border-0 opacity-90 grayscale-[35%] contrast-110"
          referrerPolicy="no-referrer"
        />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        {fix.place && <div className="text-[12.5px] leading-snug text-white/80">🏙️ {fix.place}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-white/45">
          <span>
            {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
          </span>
          <span>± {Math.round(fix.acc)}m</span>
          <a href={open} target="_blank" rel="noreferrer" className="text-emerald-300/80 underline underline-offset-2">
            open map ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * The same pin, folded into one line of the thread. A map costs 130px of
 * history every time it is drawn, so it stays shut until it is asked for.
 */
export function LocationAction({
  m,
  align = "start",
  ticks = false,
}: {
  m: Msg;
  align?: "start" | "end";
  ticks?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fix = m.fix!;
  const late = (m.title || "").includes("Late");

  return (
    <ChatAction
      m={m}
      icon="📍"
      title={m.title || "Location"}
      tone={late ? "amber" : "emerald"}
      body={fix.place || `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)} · ±${Math.round(fix.acc)}m`}
      align={align}
      ticks={ticks}
      wide={open}
      chip={
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-emerald-300/35 bg-emerald-500/10 px-1.5 py-px font-mono text-[8.5px] tracking-[0.08em] text-emerald-100/85 uppercase transition hover:border-emerald-300/70"
        >
          {open ? "hide map" : "map"}
        </button>
      }
    >
      {open && (
        <div className="mt-1.5">
          <LocationCard fix={fix} compact />
        </div>
      )}
    </ChatAction>
  );
}
