import { useEffect, useState } from "react";
import { getConn, onConn } from "../lib/sync";
import { enablePush, pushState, type PushState } from "../lib/push";
import { HOUSE_ID, isFirebase } from "../firebase";
import { getSession } from "../lib/store";

const isRemote = isFirebase;

const LOOK = {
  live: { dot: "bg-emerald-400", text: "text-emerald-300/80", label: "Live · Firestore" },
  connecting: { dot: "bg-amber-400 animate-pulse", text: "text-amber-300/80", label: "Connecting…" },
  error: { dot: "bg-rose-400", text: "text-rose-300/80", label: "Offline · cached" },
  local: { dot: "bg-white/40", text: "text-white/45", label: "Local mode" },
} as const;

export default function ConnBadge() {
  const [conn, setConn] = useState(getConn());
  const [push, setPush] = useState<PushState>(pushState());
  const [open, setOpen] = useState(false);

  useEffect(() => onConn(setConn), []);

  const l = LOOK[conn];

  const turnOnPush = async () => {
    const s = getSession();
    setPush(await enablePush(s.slaveId, s.role === "mistress" ? "mistress" : "sub"));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 transition hover:border-white/25"
        title="Connection & notifications"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
        <span className={`hidden font-mono text-[10px] tracking-[0.12em] uppercase sm:block ${l.text}`}>{l.label}</span>
        <span className="text-[11px]">{push === "granted" ? "🔔" : "🔕"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-brass/25 bg-[#120c14]/97 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)] backdrop-blur-xl">
            <div className="label">Connection</div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${l.dot}`} />
              <span className="text-[13px] text-white/80">{l.label}</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-white/45">
              {isRemote ? (
                <>
                  House <span className="font-mono text-brass-soft/80">{HOUSE_ID}</span> is stored in Firestore — every
                  decree, key, punishment and 📍 pin persists and syncs to all devices instantly.
                </>
              ) : (
                <>
                  No Firebase config found, so the house syncs across tabs on this device only. Add{" "}
                  <span className="font-mono text-brass-soft/80">.env</span> to go multi-device. ⛓️
                </>
              )}
            </p>

            <div className="mt-4 h-px bg-white/8" />

            <div className="label mt-4">Notifications</div>
            {push === "granted" ? (
              <p className="mt-2 text-[12px] text-emerald-300/80">🔔 Enabled — decrees will reach this device.</p>
            ) : push === "denied" ? (
              <p className="mt-2 text-[12px] text-rose-300/80">🔕 Blocked in browser settings.</p>
            ) : push === "unsupported" ? (
              <p className="mt-2 text-[12px] text-white/40">Not supported on this device.</p>
            ) : (
              <button
                onClick={turnOnPush}
                className="mt-2 w-full rounded-lg border border-brass/45 bg-brass/12 py-2.5 text-[12.5px] text-brass-soft transition hover:bg-brass/20"
              >
                🔔 Enable notifications
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
