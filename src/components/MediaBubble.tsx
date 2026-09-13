import { useState } from "react";
import { money, unlockMedia, viewMedia, type Msg } from "../lib/store";
import { ReadTicks, Stamp } from "./MessageMeta";
import Linkify from "./Linkify";

export default function MediaBubble({
  m,
  slaveId,
  side,
}: {
  m: Msg;
  /** present = submissive view (can unlock); absent = mistress view */
  slaveId?: string;
  side: "left" | "right";
}) {
  const [zoom, setZoom] = useState(false);
  const [err, setErr] = useState("");
  const media = m.media;
  if (!media) return null;

  const isSub = Boolean(slaveId);
  const locked = !media.unlocked;
  const burned = media.burned;
  const isImage = (media.mime || "").startsWith("image/");

  const lockLabel =
    media.lock === "tribute" ? `${money(media.price || 0)} 💰` : media.lock === "devotion" ? `♥ ${media.need}` : "";

  const tryUnlock = () => {
    if (!slaveId) return;
    const r = unlockMedia(m.id, slaveId);
    if (!r.ok) {
      setErr(r.error || "Refused.");
      setTimeout(() => setErr(""), 4000);
    }
  };

  const open = () => {
    if (locked || burned || !isImage) return;
    setZoom(true);
    viewMedia(m.id);
  };

  const close = () => {
    setZoom(false);
    if (media.burn && isSub) viewMedia(m.id, true);
  };

  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[80%]">
        <div className="overflow-hidden rounded-md border border-brass/35 bg-gradient-to-b from-[#1b1017] to-[#0b0709]">
          {/* header */}
          <div className="flex items-center gap-1.5 px-2 py-1">
            <span className="text-[10.5px] leading-none">👠</span>
            <span className="font-mono text-[9px] tracking-[0.12em] text-brass/85 uppercase">
              {burned ? "Reward · consumed" : locked ? "Locked reward" : "Reward"}
            </span>
            <span className="flex-1" />
            {media.burn && !burned && <span className="font-mono text-[8.5px] text-rose-300/80">🔥 one view</span>}
            {locked && lockLabel && (
              <span className="rounded-full border border-brass/40 bg-brass/12 px-1.5 py-px font-mono text-[8.5px] text-brass-soft">
                {lockLabel}
              </span>
            )}
          </div>

          {/* body */}
          {burned ? (
            <div className="flex h-16 items-center justify-center gap-2 bg-black/40">
              <span className="text-[16px] opacity-40">🔥</span>
              <span className="text-[11.5px] text-white/35 italic">Gone. You had your look.</span>
            </div>
          ) : locked ? (
            <button onClick={tryUnlock} disabled={!isSub} className="relative block w-full text-left">
              <div className="relative h-28 w-full overflow-hidden bg-black/50">
                {media.preview ? (
                  <img src={media.preview} alt="" className="h-full w-full scale-110 object-cover blur-xl brightness-75" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-oxblood/40 to-black" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45">
                  <span className="text-[20px] drop-shadow">🔒</span>
                  {isSub ? (
                    <>
                      <span className="text-[11.5px] font-medium text-brass-soft">
                        {media.lock === "tribute"
                          ? `Pay ${money(media.price || 0)} to look`
                          : media.lock === "devotion"
                            ? `Requires ♥ ${media.need} devotion`
                            : "Tap to reveal"}
                      </span>
                      <span className="rounded-full border border-brass/50 bg-brass/15 px-3 py-0.5 text-[10.5px] text-brass-soft">
                        Unlock 🖤
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-white/60 italic">Locked until he earns it ⛓️</span>
                  )}
                </div>
              </div>
            </button>
          ) : isImage && media.url ? (
            <button onClick={open} className="block w-full">
              <img src={media.url} alt={media.name} className="max-h-44 w-full cursor-zoom-in object-cover" />
            </button>
          ) : (
            <a
              href={media.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 transition hover:bg-white/[0.03]"
            >
              <span className="text-[16px]">📎</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-white/85">{media.name}</span>
                <span className="block text-[10px] text-white/40">tap to open</span>
              </span>
            </a>
          )}

          {/* caption */}
          {m.text && !burned && (
            <div className="px-2 py-1">
              <p className="font-display text-[12px] leading-snug text-brass-soft/90 italic">
                🖤 <Linkify text={m.text} />
              </p>
            </div>
          )}

          {!locked && !burned && media.views > 0 && (
            <div className="px-2 pb-1 font-mono text-[8.5px] text-white/30">👁️ {media.views}×</div>
          )}

          {/* when it landed, and whether he has seen it */}
          <div
            className={`flex items-center gap-1.5 px-2 pb-1 ${
              side === "right" ? "justify-end" : "justify-start"
            }`}
          >
            <Stamp at={m.time} className="text-white/25" />
            {side === "right" && <ReadTicks m={m} className="ml-1" compact />}
          </div>
        </div>

        {err && (
          <div className="mt-1 rounded border border-rose-400/35 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-100">
            {err}
          </div>
        )}
      </div>

      {zoom && media.url && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/96 p-4" onClick={close}>
          <img src={media.url} alt={media.name} className="max-h-full max-w-full rounded-xl object-contain" />
          {media.burn && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-rose-400/40 bg-rose-950/70 px-4 py-2 text-[11.5px] text-rose-100">
              🔥 This vanishes when you close it
            </div>
          )}
        </div>
      )}
    </div>
  );
}
