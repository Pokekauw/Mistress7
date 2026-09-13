import { useRef, useState } from "react";
import { isUploadFail, uploadImage } from "../lib/storage";

/**
 * Minimal portrait/backdrop picker: paste a URL or upload a file.
 * Uploads are downscaled in the browser and stored inline in Firestore as
 * a data: URL — the same path everywhere, with no Storage involved.
 */
export default function ImagePicker({
  value,
  onChange,
  label,
  hint,
  round = true,
  size = 56,
}: {
  value?: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  round?: boolean;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const [err, setErr] = useState("");

  const upload = async (f: File) => {
    setBusy(true);
    setErr("");
    try {
      /* backdrops live in the house document permanently, so they are held
         to a tighter budget than chat media */
      const r = await uploadImage(f, round ? "avatars" : "backdrops", {
        max: round ? 512 : 1600,
        targetBytes: round ? 120_000 : 160_000,
      });
      if (isUploadFail(r)) setErr(r.error);
      else onChange(r.url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <div
          style={{ width: size, height: size }}
          className={`shrink-0 overflow-hidden border border-white/12 bg-black/40 ${round ? "rounded-full" : "rounded-lg"}`}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[16px] opacity-40">🖼️</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-white/12 px-2.5 py-1.5 text-[11px] text-white/65 transition hover:border-brass/45 hover:text-brass-soft disabled:opacity-50"
            >
              {busy ? "⏳ …" : "📤 Upload"}
            </button>
            {value && (
              <button
                onClick={() => onChange("")}
                className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
              >
                Clear
              </button>
            )}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  onChange(draft.trim());
                  setDraft("");
                }
              }}
              placeholder="or paste an image URL"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11.5px] outline-none focus:border-brass/45"
            />
            {draft.trim() && (
              <button
                onClick={() => {
                  onChange(draft.trim());
                  setDraft("");
                }}
                className="rounded-md border border-brass/40 bg-brass/10 px-2.5 py-1.5 text-[11px] text-brass-soft"
              >
                Set
              </button>
            )}
          </div>
        </div>
      </div>

      {err ? (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-rose-300">{err}</p>
      ) : (
        hint && <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/30">{hint}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
