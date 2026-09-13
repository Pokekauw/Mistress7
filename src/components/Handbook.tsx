import {
  CHASTITY_ATTENTION_HOURS,
  CHASTITY_DAMAGE_MULTIPLIER,
  DEFAULT_ATTENTION_HOURS,
  disciplineOf,
  RANKS,
  type Dungeon,
} from "../lib/store";

/* ------------------------------------------------------------------ *
 *  Two sheets a submissive can open from his own header:
 *    📜 House Rules — what she has laid down for this house
 *    🧭 Guide      — how the whole machine works, from his side
 * ------------------------------------------------------------------ */

function Sheet({
  onClose,
  children,
  accent = "brass",
}: {
  onClose: () => void;
  children: React.ReactNode;
  accent?: "brass" | "plum";
}) {
  const hair = accent === "plum" ? "border-violet-400/25" : "border-brass/30";
  const wash = accent === "plum" ? "from-[#161022] to-[#0b0709]" : "from-[#1a1016] to-[#0b0709]";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className={`thin-scroll max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border bg-gradient-to-b ${hair} ${wash} p-5 sm:rounded-2xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-white/12 py-2.5 text-[13px] text-white/60 transition hover:border-white/25"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3.5">
      <div className="label !text-brass-soft/80">
        {icon} {title}
      </div>
      <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-relaxed text-white/60">{children}</div>
    </div>
  );
}

/* ------------------------------ house rules ------------------------------ */

export function HouseRulesSheet({ dungeon, onClose }: { dungeon: Dungeon; onClose: () => void }) {
  const rules = (dungeon.rules || []).filter((r) => r.trim());

  return (
    <Sheet onClose={onClose}>
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-[20px]">
          📜
        </div>
        <h3 className="font-display mt-3 text-[1.6rem] leading-tight text-white">
          House Rules of <span className="gold-text">{dungeon.name}</span>
        </h3>
        <p className="mt-1.5 font-mono text-[10px] tracking-[0.16em] text-white/35 uppercase">
          laid down by {dungeon.honorific}
        </p>
      </div>

      {rules.length ? (
        <ol className="mt-5 space-y-2">
          {rules.map((r, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-lg border border-brass/20 bg-brass/[0.05] px-3.5 py-2.5 text-[13px] leading-snug text-white/80"
            >
              <span className="font-mono text-[11px] text-brass/80">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{r}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-4 text-center text-[12.5px] text-white/45 italic">
          She has not written them down yet. Ask her — but ask it as a request, never a demand.
        </p>
      )}

      <div className="mt-5 rounded-xl border border-brass/25 bg-gradient-to-br from-brass/12 to-transparent p-4">
        <div className="label">Her entry rite</div>
        <p className="font-display mt-1.5 text-[14.5px] leading-snug text-brass-soft/90 italic">
          “{dungeon.entryRite}”
        </p>
      </div>

      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-white/40">
        Break a rule and it is not a discussion — it is a strike. You are told this up front, which is the only mercy
        you will get. 🖤
      </p>
    </Sheet>
  );
}

/* --------------------------------- guide --------------------------------- */

export function GuideSheet({ dungeon, onClose }: { dungeon: Dungeon; onClose: () => void }) {
  /* her own prices — she sets them, so the guide quotes them, not the defaults */
  const costs = disciplineOf(dungeon);

  return (
    <Sheet onClose={onClose} accent="plum">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/45 bg-violet-500/10 text-[20px]">
          🧭
        </div>
        <h3 className="font-display mt-3 text-[1.6rem] leading-tight text-white">
          A slave's guide to <span className="gold-text">{dungeon.name}</span>
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
          You hold nothing here except your devotion. This is how you earn it — and how you lose it.
        </p>
      </div>

      <Section icon="♥" title="Devotion is the only currency">
        <p>
          Every number on your screen is a judgement of you. <span className="text-brass-soft">Devotion ♥</span> is
          the one that matters: she raises it when you obey without being pushed, and the engine takes it away when
          you go quiet. It is capped at ♥100.
        </p>
      </Section>

      <Section icon="👑" title="The rituals — pressed as often as you like">
        <p>
          The row of buttons above your message box are acts of worship. Press them as often as you wish — every
          press is real, it reaches her thread and it winds your silence timer back.
        </p>
        <ul className="mt-1 space-y-1">
          {[
            ["👑 Worship", "+4 ♥"],
            ["🧎 Kneel & Wait", "+2 ♥"],
            ["🙏 Beg", "+3 ♥"],
            ["📿 Confess", "+3 ♥"],
            ["👢 Boot Service", "+5 ♥"],
          ].map(([label, dev]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="text-white/70">{label}</span>
              <span className="flex-1 border-b border-dashed border-white/12" />
              <span className="font-mono text-[11px] text-brass-soft">{dev}</span>
            </li>
          ))}
        </ul>
        <p className="text-amber-200/75">
          Each button pays out <span className="font-medium">once per day</span> (a rolling 24 hours, per button).
          After that you may keep kneeling — she will see it — but the ♥ is already banked, and the button shows how
          long until it pays again.
        </p>
      </Section>

      <Section icon="⏳" title="Silence has a price">
        <p>
          Your attention timer runs whenever you are absent, and it is drawn as a bar above your standing: full when you
          have just served her, draining towards nothing. If it empties in silence you are fined{" "}
          <span className="text-rose-200">{costs.attention} ♥</span> automatically — no warning, no argument — and the
          bar starts again. A message, a ritual, a tribute, a proof, a location pin: any of them winds it back to full.
        </p>
        <p className="text-white/45">
          The window is normally {DEFAULT_ATTENTION_HOURS} hours. She may set it shorter or longer for you alone.
        </p>
      </Section>

      <Section icon="🔒" title="Chastity is a different animal">
        <p>
          While she holds you locked you are on{" "}
          <span className="text-violet-200">double damage ×{CHASTITY_DAMAGE_MULTIPLIER}</span>: a fine of{" "}
          {costs.attention} ♥ becomes {costs.attention * CHASTITY_DAMAGE_MULTIPLIER} ♥, and every strike, every missed
          check-in, every rejected proof costs twice what it would otherwise.
        </p>
        <p>
          Your leash shortens too — <span className="text-violet-200">{CHASTITY_ATTENTION_HOURS} hours</span> to speak
          or serve, instead of {DEFAULT_ATTENTION_HOURS}. The bar says so while the lock is on. Rewards are never
          doubled; only the pain is.
        </p>
      </Section>

      <Section icon="📈" title="Your rank">
        <p>Devotion is read as a rank. It is how she introduces you to the house.</p>
        <ul className="mt-1 space-y-1">
          {RANKS.map(([n, title]) => (
            <li key={title} className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-brass-soft/85">♥ {n}</span>
              <span className="flex-1 border-b border-dashed border-white/12" />
              <span className="text-white/70">{title}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="📸" title="Prove it, don't claim it">
        <p>
          <span className="text-white/75">📸 Submit proof</span> — send her evidence of what you were told to do. She
          judges it; while it waits you see “awaiting judgement”.
        </p>
        <p>
          <span className="text-white/75">📍 Share location</span> — when she demands a check-in, the window is
          running. Answer it, or the miss is recorded against you.
        </p>
        <p>
          <span className="text-white/75">💰 Tribute</span> — an offer, never a payment. Nothing is recorded until she
          accepts it. Your own monthly cap is enforced by the engine, and it protects you.
        </p>
      </Section>

      <Section icon="🛡" title="What protects you">
        <p>
          <span className="text-white/75">Limits</span> — open them and mark what is off the table. They are enforced
          by the engine; she cannot override them, however she asks.
        </p>
        <p>
          <span className="text-white/75">Safeword</span> — hold the red bar at the bottom for a moment. Everything
          stops, tribute freezes for an hour, and pride is the only thing you lose.
        </p>
        <p>
          <span className="text-white/75">House Rules</span> — her own laws for this house, always readable from your
          header. Know them before you test them.
        </p>
      </Section>

      <Section icon="⌨" title="Around your screen">
        <p>
          <span className="text-white/75">At the top</span> — her name, and the way out: Limits and Exit. Underneath,
          one slim line is yours: your name, your rank, and the 🗝️ code that lets you back in. Touch either and the
          code is shown in full. It never expires unless she takes it from you.
        </p>
        <p>
          <span className="text-white/75">In the chat</span> — every message carries the time it was sent. ✓ means
          she has it; ✓✓ means she has seen it, with the hour she saw it. When she is writing, you will see it — and
          she sees when you are writing too. A link in a message is a link: tap it and it opens.
        </p>
        <p>
          <span className="text-white/75">📜 Command log</span> — the unglamorous record of every order and outcome.
          It is never on your side. Assume she has read it.
        </p>
      </Section>

      <div className="mt-5 rounded-xl border border-brass/30 bg-gradient-to-br from-brass/14 to-transparent p-4">
        <div className="label">The three laws of a kept slave</div>
        <ol className="font-display mt-2 space-y-1 text-[13.5px] text-brass-soft/90 italic">
          <li>Answer her. Silence is the only sin she cannot forgive.</li>
          <li>Ask — never demand. Devotion is given, never taken.</li>
          <li>One day of kneeling beats one hour of enthusiasm.</li>
        </ol>
      </div>
    </Sheet>
  );
}
