import { useRef, useState } from "react";
import { money, sendMedia, TEASE_CAPTIONS, type LockKind } from "../lib/store";
import { isUploadFail, makeBlurPreview, uploadImage } from "../lib/storage";

export default function MediaComposer({
  targets,
  targetNames,
  onClose,
  onSent,
}: {
  targets: string[];
  targetNames: string;
  onClose: () => void;
  onSent: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [lock, setLock] = useState<LockKind>("free");
  const [price, setPrice] = useState(150);
  const [need, setNeed] = useState(50);
  const [burn, setBurn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = (f: File) => {
    setFile(f);
    setErr("");
    if (f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = () => setLocalPreview(String(r.result));
      r.readAsDataURL(f);
    } else setLocalPreview(null);
  };

  const send = async () => {
    if (!file || !targets.length) return;
    setBusy(true);
    setErr("");
    /* no upload happens: the image is compressed and stored inline, and the
       reason for a refusal is passed straight through to him */
    const up = await uploadImage(file, "media");
    if (isUploadFail(up)) {
      setBusy(false);
      setErr(up.error);
      return;
    }
    const preview = await makeBlurPreview(file);
    sendMedia(
      targets,
      {
        url: up.url,
        path: up.path,
        mime: file.type || "application/octet-stream",
        name: file.name,
        preview,
        lock,
        price: lock === "tribute" ? price : undefined,
        need: lock === "devotion" ? need : undefined,
        burn,
      },
      caption.trim()
    );
    setBusy(false);
    onSent(
      lock === "free"
        ? `👠 Reward sent to ${targets.length}`
        : `👠 Locked teaser sent · ${lock === "tribute" ? money(price) : `♥${need}`}`
    );
    onClose();
  };

  const LOCKS: { id: LockKind; icon: string; label: string; hint: string }[] = [
    { id: "free", icon: "🎁", label: "Gift", hint: "He sees it at once" },
    { id: "tribute", icon: "💰", label: "Paywall", hint: "He must pay to look" },
    { id: "devotion", icon: "♥", label: "Earned", hint: "Devotion threshold" },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 px-4 py-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="thin-scroll max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-brass/35 bg-gradient-to-b from-[#1c1118] to-[#0a070b] p-6 shadow-[0_40px_120px_-20px_rgba(0,0,0,.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[20px]">👠</span>
          <div>
            <div className="label">Reward · teaser</div>
            <div className="font-display text-[1.5rem] leading-none text-white">Send media</div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] text-white/55">
          To: <span className="text-brass-soft">{targetNames}</span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) pick(f);
          }}
        />

        {file ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            {localPreview ? (
              <img src={localPreview} alt="preview" className="max-h-52 w-full object-cover" />
            ) : (
              <div className="py-8 text-center text-[13px] text-white/60">📎 {file.name}</div>
            )}
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 truncate text-[11.5px] text-white/45">
                {file.name} · {Math.round(file.size / 1024)} KB
              </span>
              <button onClick={() => { setFile(null); setLocalPreview(null); }} className="text-[11.5px] text-rose-300">
                remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full rounded-xl border border-dashed border-brass/40 bg-brass/6 py-10 text-center transition hover:bg-brass/12"
          >
            <div className="text-[28px]">📸</div>
            <div className="mt-2 text-[13px] text-brass-soft/85">Choose a photo or file</div>
            <div className="mt-1 text-[11px] text-white/35">boots · heels · a glimpse he must earn 👠</div>
          </button>
        )}

        <div className="label mt-5">Caption</div>
        <textarea
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Look. And know you cannot touch. 👠"
          className="mt-2 w-full resize-none rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[13.5px] outline-none focus:border-brass/55"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TEASE_CAPTIONS.slice(0, 3).map((c) => (
            <button
              key={c}
              onClick={() => setCaption(c)}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[10.5px] text-white/50 transition hover:border-brass/40 hover:text-brass-soft"
            >
              {c.slice(0, 26)}…
            </button>
          ))}
        </div>

        <div className="label mt-5">How he gets it 🔒</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LOCKS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLock(l.id)}
              className={`rounded-lg border px-2 py-2.5 text-center transition ${
                lock === l.id ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/10 text-white/50"
              }`}
            >
              <div className="text-[15px]">{l.icon}</div>
              <div className="mt-1 text-[11.5px] font-medium">{l.label}</div>
              <div className="mt-0.5 text-[9.5px] leading-tight opacity-60">{l.hint}</div>
            </button>
          ))}
        </div>

        {lock === "tribute" && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="label">Price</span>
              <span className="font-mono text-[13px] text-brass-soft">{money(price)}</span>
            </div>
            <input type="range" min={25} max={1000} step={25} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-2 w-full" />
          </div>
        )}

        {lock === "devotion" && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="label">Devotion required</span>
              <span className="font-mono text-[13px] text-brass-soft">♥ {need}</span>
            </div>
            <input type="range" min={5} max={100} step={5} value={need} onChange={(e) => setNeed(Number(e.target.value))} className="mt-2 w-full" />
          </div>
        )}

        <button
          onClick={() => setBurn((v) => !v)}
          className={`mt-4 flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
            burn ? "border-rose-400/45 bg-rose-500/10 text-rose-100" : "border-white/10 text-white/55"
          }`}
        >
          <span className="text-[12.5px]">🔥 Burn after viewing</span>
          <span className="font-mono text-[10px] uppercase">{burn ? "on" : "off"}</span>
        </button>

        {err && <p className="mt-3 text-[12px] text-rose-300">{err}</p>}

        <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
          🖤 Compressed and stored inline in the database — no upload, so it survives
          reloads on every device.
        </p>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!file || busy}
            className={`flex-1 rounded-lg border py-3 text-[13px] font-medium transition ${
              file && !busy
                ? "border-brass/55 bg-gradient-to-r from-brass/35 to-brass/15 text-brass-soft"
                : "cursor-not-allowed border-white/8 text-white/25"
            }`}
          >
            {busy ? "⏳ Preparing…" : "Send 👠"}
          </button>
        </div>
      </div>
    </div>
  );
}
