import type { EmojiGroup, EmojiPreset } from "../lib/emojis";

/* ------------------------------------------------------------------ *
 *  The emoji drawer above a chat box.
 *
 *  One panel, two stations. She gets it with a row of favourites on top —
 *  her signed moods, one tap. He gets the same panel with no favourites
 *  whatsoever: only the emojis he is allowed, plus the handful he uses so
 *  often they are kept for him.
 * ------------------------------------------------------------------ */

type Props = {
  /** panel heading — "Mistress favourites" for her, "Your emojis" for him */
  title: string;
  hint?: string;
  /** her one-tap signed moods. a slave has none, so he never sees this row */
  presets?: EmojiPreset[];
  /** his most-used allowed emojis, remembered for him */
  usuals?: string[];
  groups: EmojiGroup[];
  onPick: (snippet: string) => void;
  onClose: () => void;
};

export default function EmojiPanel({ title, hint, presets, usuals, groups, onPick, onClose }: Props) {
  const hasPresets = Boolean(presets?.length);
  const hasUsuals = Boolean(usuals?.length);

  return (
    <div className="mb-3 rounded-2xl border border-brass/25 bg-[#0c0810]/95 p-3 shadow-[0_-18px_50px_-28px_rgba(0,0,0,.95)]">
      <div className="flex items-center gap-2">
        <span className="label">{title}</span>
        {hint && <span className="truncate text-[10.5px] leading-tight text-white/30">{hint}</span>}
        <span className="flex-1" />
        <button
          onClick={onClose}
          className="rounded-full px-2 text-[13px] text-white/35 transition hover:bg-white/8 hover:text-white/70"
          title="Close emoji panel"
        >
          ×
        </button>
      </div>

      {hasPresets && (
        <div className="thin-scroll mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {presets!.map((p) => (
            <button
              key={p.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(p.value)}
              title={p.value}
              className="shrink-0 rounded-full border border-brass/35 bg-brass/10 px-3 py-1.5 text-[11px] text-brass-soft transition hover:border-brass/70 hover:bg-brass/18"
            >
              <span className="mr-1.5 font-mono text-[9.5px] text-white/45">{p.label}</span>
              {p.value}
            </button>
          ))}
        </div>
      )}

      {hasUsuals && (
        <div className="mt-2">
          <div className="mb-1.5 font-mono text-[9px] tracking-[0.16em] text-white/30 uppercase">Your usuals</div>
          <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-1">
            {usuals!.map((e) => (
              <button
                key={e}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => onPick(e)}
                title={e}
                className="shrink-0 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[15px] transition hover:border-brass/60 hover:bg-brass/12"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="thin-scroll mt-3 max-h-44 space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 font-mono text-[9px] tracking-[0.16em] text-white/30 uppercase">{group.label}</div>
            <div className="grid grid-cols-8 gap-1 sm:grid-cols-12">
              {group.emojis.map((emoji) => (
                <button
                  key={`${group.label}-${emoji}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(emoji)}
                  className="rounded-lg border border-white/8 bg-white/[0.025] py-1.5 text-[18px] transition hover:border-brass/45 hover:bg-brass/10"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
