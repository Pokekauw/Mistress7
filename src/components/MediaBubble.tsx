import { useState } from "react";
import { attachmentUrl, money, unlockMedia, viewMedia, type Msg } from "../lib/store";
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
  /** the Storage download URL (msg.imageUrl), falling back to the nested field */
  const url = attachmentUrl(m);

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
      <div className="w-full max-w-[86%]">
        <div className="overflow-hidden rounded-xl border border-brass/35 bg-gradient-to-b from-[#1b1017] to-[#0b0709] shadow-[0_18px_50px_-25px_rgba(0,0,0,.9)]">
          {/* header */}
          <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
            <span className="text-[13px]">👠</span>
            <span className="label !text-brass-soft/75">
              {burned ? "Reward · consumed" : locked ? "Locked reward" : "From your Mistress"}
            </span>
            <span className="flex-1" />
            {media.burn && !burned && <span className="font-mono text-[9px] text-rose-300/80">🔥 one view</span>}
            {locked && lockLabel && (
              <span className="rounded-full border border-brass/40 bg-brass/12 px-2 py-0.5 font-mono text-[9.5px] text-brass-soft">
                {lockLabel}
              </span>
            )}
          </div>

          {/* body */}
          {burned ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 bg-black/40">
              <span className="text-[26px] opacity-40">🔥</span>
              <span className="text-[12px] text-white/35 italic">Gone. You had your look.</span>
            </div>
          ) : locked ? (
            <button onClick={tryUnlock} disabled={!isSub} className="relative block w-full text-left">
              <div className="relative h-44 w-full overflow-hidden bg-black/50">
                {media.preview ? (
                  <img src={media.preview} alt="" className="h-full w-full scale-110 object-cover blur-xl brightness-75" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-oxblood/40 to-black" />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
                  <span className="text-[28px] drop-shadow">🔒</span>
                  {isSub ? (
                    <>
                      <span className="text-[12.5px] font-medium text-brass-soft">
                        {media.lock === "tribute"
                          ? `Pay ${money(media.price || 0)} to look`
                          : media.lock === "devotion"
                            ? `Requires ♥ ${media.need} devotion`
                            : "Tap to reveal"}
                      </span>
                      <span className="rounded-full border border-brass/50 bg-brass/15 px-3.5 py-1 text-[11px] text-brass-soft">
                        Unlock 🖤
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] text-white/60 italic">Locked until he earns it ⛓️</span>
                  )}
                </div>
              </div>
            </button>
          ) : isImage && url ? (
            <button onClick={open} className="block w-full">
              <img src={url} alt={media.name} className="max-h-72 w-full cursor-zoom-in object-cover" />
            </button>
          ) : (
            <a
              href={url || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-5 transition hover:bg-white/[0.03]"
            >
              <span className="text-[22px]">📎</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-white/85">{media.name}</span>
                <span className="block text-[11px] text-white/40">tap to open</span>
              </span>
            </a>
          )}

          {/* caption */}
          {m.text && !burned && (
            <div className="border-t border-white/8 px-3 py-2.5">
              <p className="font-display text-[13.5px] leading-snug text-brass-soft/90 italic">
                🖤 <Linkify text={m.text} />
              </p>
            </div>
          )}

          {!locked && !burned && media.views > 0 && (
            <div className="px-3 pb-2 font-mono text-[9.5px] text-white/30">
              👁️ viewed {media.views}×
            </div>
          )}

          {/* when it landed, and whether he has seen it */}
          <div
            className={`flex items-center gap-1.5 px-3 pb-2 ${
              side === "right" ? "justify-end" : "justify-start"
            }`}
          >
            <Stamp at={m.time} className="text-white/30" />
            {side === "right" && <ReadTicks m={m} className="ml-1" />}
          </div>
        </div>

        {err && (
          <div className="mt-1.5 rounded-lg border border-rose-400/35 bg-rose-950/40 px-3 py-2 text-[12px] text-rose-100">
            {err}
          </div>
        )}
      </div>

      {zoom && url && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/96 p-4" onClick={close}>
          <img src={url} alt={media.name} className="max-h-full max-w-full rounded-xl object-contain" />
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
