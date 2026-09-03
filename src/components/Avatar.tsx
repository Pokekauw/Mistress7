import { useEffect, useState } from "react";

/**
 * Portrait. Falls back gracefully: custom URL → bundled crest → emoji,
 * so a broken link can never leave a hole in the interface.
 */
export default function Avatar({
  size = 32,
  ring = true,
  src,
  fallback = "👑",
  alt = "Mistress",
}: {
  size?: number;
  ring?: boolean;
  /** custom portrait; empty falls back to the bundled crest */
  src?: string;
  fallback?: string;
  alt?: string;
}) {
  const chain = [src?.trim(), fallback === "👑" ? "/mistress.png" : ""].filter(Boolean) as string[];
  const [step, setStep] = useState(0);

  /* a new url should get a fresh chance */
  useEffect(() => setStep(0), [src]);

  const url = chain[step];
  const style = { width: size, height: size } as const;

  if (!url)
    return (
      <span
        style={{ ...style, fontSize: Math.round(size * 0.44) }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brass/40 to-oxblood/60 ${
          ring ? "ring-1 ring-brass/50" : ""
        }`}
      >
        {fallback}
      </span>
    );

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setStep((n) => n + 1)}
      style={style}
      className={`shrink-0 rounded-full object-cover ${ring ? "ring-1 ring-brass/50" : ""}`}
    />
  );
}

/** Identity block used in headers */
export function AvatarPlate({
  name,
  honorific,
  src,
}: {
  name: string;
  honorific: string;
  src?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Avatar size={44} src={src} />
        <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#0a0709] bg-emerald-400 text-[7px]">
          ●
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-display truncate text-[1.15rem] leading-tight text-white">
          {honorific} {name} 👑
        </div>
        <div className="label !text-emerald-300/70">watching</div>
      </div>
    </div>
  );
}

/** Portrait for a submissive — same fallback chain, different default glyph */
export function SlaveAvatar({ size = 28, src, name }: { size?: number; src?: string; name?: string }) {
  return <Avatar size={size} src={src} fallback="⛓️" alt={name || "submissive"} ring={false} />;
}
