import { useRef, useState } from "react";
import { BG_PRESETS, type ChatBg } from "../lib/store";
import { isUploadFail, uploadImage } from "../lib/storage";

/** Six colour washes plus an optional image. Deliberately small. */
export default function BgPicker({
  value,
  onChange,
  onReset,
  label = "Chat backdrop",
  resetLabel,
}: {
  value: ChatBg;
  onChange: (bg: ChatBg) => void;
  onReset?: () => void;
  label?: string;
  resetLabel?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (f: File) => {
    setBusy(true);
    try {
      /* stored inline in the house document, so keep it light */
      const r = await uploadImage(f, "backdrops", { max: 1600, targetBytes: 160_000 });
      if (!isUploadFail(r)) onChange({ kind: "image", value: r.url });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="label">{label}</span>
        <span className="flex-1" />
        {onReset && (
          <button onClick={onReset} className="text-[10.5px] text-white/35 underline underline-offset-2 hover:text-white/60">
            {resetLabel || "Reset"}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {BG_PRESETS.map((p) => {
          const on = value.kind === "preset" && value.value === p.id;
          return (
            <button
              key={p.id}
              title={p.label}
              onClick={() => onChange({ kind: "preset", value: p.id })}
              style={{ background: p.css }}
              className={`h-9 w-9 rounded-lg border transition ${
                on ? "border-brass ring-1 ring-brass/50" : "border-white/12 hover:border-white/35"
              }`}
            />
          );
        })}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Upload an image"
          className={`h-9 w-9 overflow-hidden rounded-lg border text-[13px] transition disabled:opacity-50 ${
            value.kind === "image" ? "border-brass ring-1 ring-brass/50" : "border-dashed border-white/25 hover:border-brass/50"
          }`}
        >
          {value.kind === "image" && value.value ? (
            <img src={value.value} alt="" className="h-full w-full object-cover" />
          ) : busy ? (
            "⏳"
          ) : (
            "🖼️"
          )}
        </button>
      </div>

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
