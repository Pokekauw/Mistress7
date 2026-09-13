import { useEffect, useRef, useState } from "react";
import Avatar from "../components/Avatar";
import { setSession, setPlan } from "../lib/store";
import { PLANS, type PlanId } from "../lib/plans";

/* ---------------- reveal ---------------- */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (e) => e.forEach((x) => x.isIntersecting && (setSeen(true), io.disconnect())),
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${seen ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------- data ---------------- */
const POWERS = [
  { i: "⛓️", t: "Penance & Decree", d: "Skriv en ordre eller en straf, vælg blandt færdige formuleringer, og send den som et dekret han ikke kan overse." },
  { i: "🔒", t: "Gag & Chastity", d: "Justerbare nedtællinger fra 10 minutter til 24 timer. En gagget sub kan bogstavelt talt ikke skrive til dig — og en sub i chastity er på dobbelt straf med kun 6 timer til at reagere." },
  { i: "📍", t: "Live Location Ping", d: "Kræv check-in med tidsfrist. Overskrider han den, straffer systemet ham automatisk — også mens du sover." },
  { i: "📸", t: "Proof of Compliance", d: "Han uploader billedbevis på udført straf. Du dømmer med ét tryk: accepteret eller afvist." },
  { i: "🗝️", t: "Nøgler & Revoke", d: "Udsted signerede nøgler bundet til navn og tier. Inddrag adgangen, og døren lukker for ham med det samme." },
  { i: "👑", t: "Devotion & Rang", d: "Hver handling skriver til hans profil. Devotion, strikes, ledger og rang — hele hans historik på ét kort. Du bestemmer selv, hvad de enkelte strikes skal koste." },
];

const ICONS: Record<string, string> = { chamber: "🖤", house: "👑", dynasty: "⛓️" };

const TIERS = PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  icon: ICONS[p.id] || "🖤",
  price: p.price,
  tagline: p.tagline,
  seats: p.maxSlaves === null ? "Ubegrænset antal subs" : `Op til ${p.maxSlaves} subs`,
  perks: p.perks,
  take: "0% kommission — du beholder alt",
  featured: p.featured,
}));

const STEPS = [
  { n: "01", t: "Rejs dit hus", d: "Navngiv det, sæt honorific, entry rite, regler og priser. Under ni minutter." },
  { n: "02", t: "Udsted nøgler", d: "Mint en nøgle, bind den til hans navn, giv den videre. Ingen kommer ind uden." },
  { n: "03", t: "Hersk", d: "Kommandoer, timere, lokation og beviser. Systemet håndhæver — også når du ikke ser på." },
];

/* ---------------- page ---------------- */
export default function Landing({ go }: { go: (r: string) => void }) {
  const [buying, setBuying] = useState<null | (typeof TIERS)[number]>(null);
  const [phase, setPhase] = useState<"confirm" | "processing" | "done">("confirm");

  const startPurchase = (t: (typeof TIERS)[number]) => {
    setBuying(t);
    setPhase("confirm");
  };

  const confirm = () => {
    setPhase("processing");
    setTimeout(() => setPhase("done"), 1400);
  };

  const enterSystem = () => {
    if (buying) setPlan(buying.id as PlanId);
    setSession({ role: "mistress", slaveId: null });
    go("#/deck");
  };

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="page-canvas relative min-h-screen overflow-x-hidden">
      {/* ---------- nav ---------- */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/6 bg-[#0a0709]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brass/45 text-[13px]">⛓️</span>
            <span className="font-display text-[16px] tracking-[0.3em] text-white/90">DOMINION</span>
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["Magtmidler", "powers"],
              ["Sådan virker det", "how"],
              ["Priser", "pricing"],
            ].map(([l, id]) => (
              <button key={id} onClick={() => jump(id)} className="rounded-full px-3.5 py-2 text-[12.5px] text-white/50 transition hover:text-brass-soft">
                {l}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#/gate"
              className="rounded-full border border-brass/40 bg-brass/10 px-4 py-2 text-[12px] text-brass-soft transition hover:bg-brass/20"
            >
              🔒 Log ind
            </a>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-32 pb-20 md:px-8 md:pt-44">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-brass/25 bg-brass/8 px-3.5 py-1.5">
                <span className="text-[11px]">👑</span>
                <span className="font-mono text-[10px] tracking-[0.2em] text-brass-soft/80 uppercase">For professionelle Dominas</span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="font-display mt-6 text-[3.2rem] leading-[0.95] tracking-tight sm:text-[4.4rem] md:text-[5.4rem]">
                <span className="gold-text">Hendes ord</span>
                <br />
                <span className="text-white/92">bliver til system.</span>
              </h1>
            </Reveal>

            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/58 md:text-[17px]">
                Dominion er kontrolpanelet for den professionelle Mistress. Straffe, nedtællinger, lokationskrav,
                beviser og tributes — håndhævet af maskinen, døgnet rundt. Du skalerer din magt uden at bruge en time mere. 🖤
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => jump("pricing")}
                  className="rounded-full border border-brass/50 bg-gradient-to-r from-brass/28 to-brass/12 px-7 py-3.5 text-[13.5px] font-medium text-brass-soft transition hover:from-brass/40"
                >
                  Vælg dit niveau ⛓️
                </button>
                <a
                  href="#/gate"
                  className="rounded-full border border-white/12 px-7 py-3.5 text-[13.5px] text-white/65 transition hover:border-white/30 hover:text-white"
                >
                  Prøv demoen →
                </a>
              </div>
            </Reveal>

            <Reveal delay={290}>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3">
                {[
                  ["🔒", "Diskret fakturering"],
                  ["📍", "Live tracking"],
                  ["⛓️", "Automatisk håndhævelse"],
                ].map(([i, t]) => (
                  <span key={t} className="flex items-center gap-2 text-[12.5px] text-white/45">
                    <span>{i}</span>
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* preview card */}
          <Reveal delay={260}>
            <div className="relative">
              <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brass/12 via-oxblood/10 to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-brass/25 bg-gradient-to-b from-[#17101a] to-[#0a070b] shadow-[0_40px_120px_-30px_rgba(0,0,0,.95)]">
                <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3">
                  <Avatar size={34} />
                  <div className="min-w-0">
                    <div className="font-display text-[14px] leading-tight text-white">Mistress · House of Ash 👑</div>
                    <div className="label !text-emerald-300/70">watching</div>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  <div className="rounded-lg border border-brass/30 bg-brass/8 px-3 py-2 text-center text-[12px] text-brass-soft/90 italic">
                    ⛓️ Du tildeler penance: Kneel facing the corner for 20 minutes.
                  </div>
                  <div className="rounded-lg border border-amber-400/35 bg-amber-500/8 px-3 py-2 text-center text-[12px] text-amber-100/85">
                    📍 Check-in krævet · 14m tilbage ⏳
                  </div>
                  <div className="flex justify-start gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-white/5 text-[10px]">⛓️</span>
                    <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.05] px-3 py-2 text-[12.5px] text-white/75">
                      Ja, Mistress. Med det samme. 🖤
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/8 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px]">📍</span>
                      <span className="label !text-emerald-200/75">Location pinned</span>
                      <span className="flex-1" />
                      <span className="font-mono text-[9px] text-white/40">±12m</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      ["🖤", "62"],
                      ["💥", "1"],
                      ["🤐", "8m"],
                      ["🔒", "3h"],
                    ].map(([i, v]) => (
                      <div key={i} className="rounded-md border border-white/8 bg-white/[0.03] py-1.5 text-center">
                        <div className="text-[11px]">{i}</div>
                        <div className="font-display text-[13px] text-white/85">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- powers ---------- */}
      <section id="powers" className="relative z-10 mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Reveal>
          <div className="flex items-baseline gap-5">
            <span className="font-mono text-[10px] tracking-[0.3em] text-brass/70">01</span>
            <div className="rule-gold flex-1" />
          </div>
          <h2 className="font-display mt-6 text-[2.4rem] leading-tight text-white md:text-[3.4rem]">Totale magtmidler ⛓️</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/55">
            Ikke endnu en chat-app. Hvert tryk skriver til en tilstandsmaskine, der bliver ved med at køre, når du lukker skærmen.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
          {POWERS.map((p, i) => (
            <Reveal key={p.t} delay={i * 55}>
              <div className="h-full bg-[#0c0810] p-6 transition hover:bg-[#120c14]">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-brass/25 bg-brass/8 text-[19px]">{p.i}</span>
                <h3 className="font-display mt-4 text-[1.35rem] text-white">{p.t}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/58">{p.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- how ---------- */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-4 py-20 md:px-8">
        <Reveal>
          <div className="flex items-baseline gap-5">
            <span className="font-mono text-[10px] tracking-[0.3em] text-brass/70">02</span>
            <div className="rule-gold flex-1" />
          </div>
          <h2 className="font-display mt-6 text-[2.4rem] leading-tight text-white md:text-[3.4rem]">Tre skridt til dit hus 🔒</h2>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <div className="card h-full rounded-xl p-7">
                <span className="font-display text-[2.6rem] leading-none gold-text">{s.n}</span>
                <h3 className="font-display mt-4 text-[1.45rem] text-white">{s.t}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/58">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Reveal>
          <div className="flex items-baseline gap-5">
            <span className="font-mono text-[10px] tracking-[0.3em] text-brass/70">03</span>
            <div className="rule-gold flex-1" />
          </div>
          <h2 className="font-display mt-6 text-[2.4rem] leading-tight text-white md:text-[3.4rem]">
            Vælg dit <span className="gold-text">niveau</span> 👑
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/55">
            Rent månedligt abonnement. Vi tager <span className="text-brass-soft">0% kommission</span> — hvert eneste
            tribut går direkte fra ham til dig, uanset hvilken plan du er på. 🖤
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <Reveal key={t.id} delay={i * 80}>
              <div
                className={`relative flex h-full flex-col rounded-2xl border p-7 transition ${
                  t.featured
                    ? "border-brass/50 bg-gradient-to-b from-brass/14 via-oxblood/8 to-transparent shadow-[0_30px_80px_-30px_rgba(201,162,39,.35)] lg:-mt-4 lg:mb-4"
                    : "card"
                }`}
              >
                {t.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-brass/50 bg-[#160e14] px-3.5 py-1 font-mono text-[9.5px] tracking-[0.2em] text-brass-soft uppercase">
                    Mest valgt
                  </span>
                )}

                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/30 bg-brass/8 text-[19px]">{t.icon}</span>
                  <div>
                    <h3 className="font-display text-[1.5rem] leading-tight text-white">{t.name}</h3>
                    <div className="label mt-0.5">{t.seats}</div>
                  </div>
                </div>

                <p className="mt-4 text-[13px] text-white/50 italic">{t.tagline}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-[3.2rem] leading-none gold-text">{t.price}</span>
                  <span className="text-[13px] text-white/45">kr./md.</span>
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-emerald-300/70">✦ {t.take}</div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {t.perks.map((p) => (
                    <li key={p} className="flex gap-2.5 text-[13.5px] leading-snug text-white/68">
                      <span className="mt-0.5 text-brass/80">✦</span>
                      {p}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => startPurchase(t)}
                  className={`mt-7 w-full rounded-xl py-3.5 text-[13.5px] font-medium transition active:scale-[0.98] ${
                    t.featured
                      ? "border border-brass/60 bg-gradient-to-r from-brass/35 to-brass/15 text-brass-soft hover:from-brass/50"
                      : "border border-white/15 bg-white/5 text-white/80 hover:border-brass/45 hover:text-brass-soft"
                  }`}
                >
                  Start nu ⛓️
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-8 text-center text-[12px] text-white/30">
            🔒 Neutral fakturering · ingen binding · digital-only. Demo-køb — der trækkes ingen betaling.
          </p>
        </Reveal>
      </section>

      {/* ---------- closing ---------- */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 py-20 text-center md:px-8 md:py-28">
        <Reveal>
          <p className="font-display text-[1.8rem] leading-snug text-brass-soft/85 italic md:text-[2.6rem]">
            “Byg maskinen der håndhæver hendes ord — så sælger hun aldrig igen sine timer i timen.” 🖤
          </p>
          <button
            onClick={() => jump("pricing")}
            className="mt-10 rounded-full border border-brass/50 bg-brass/15 px-8 py-3.5 text-[13.5px] text-brass-soft transition hover:bg-brass/25"
          >
            Rejs dit hus 👑
          </button>
        </Reveal>
      </section>

      <footer className="relative z-10 border-t border-white/6 py-9">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center md:px-8">
          <span className="font-display text-[14px] tracking-[0.3em] text-white/40">DOMINION ⛓️</span>
          <p className="font-mono text-[9.5px] tracking-[0.2em] text-white/22 uppercase">
            Kun for voksne · digital-only · demo-miljø
          </p>
          <a href="#/gate" className="text-[11.5px] text-white/30 underline underline-offset-4 hover:text-white/60">
            Members entrance 🔒
          </a>
        </div>
      </footer>

      {/* ---------- purchase modal ---------- */}
      {buying && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
          onClick={() => phase !== "processing" && setBuying(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-brass/35 bg-gradient-to-b from-[#1c1118] to-[#0a070b] p-8 text-center shadow-[0_40px_120px_-20px_rgba(0,0,0,.95)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brass/15 blur-3xl" />

            {phase === "confirm" && (
              <>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[28px]">
                  {buying.icon}
                </span>
                <h3 className="font-display mt-5 text-[1.9rem] leading-tight text-white">{buying.name}</h3>
                <div className="mt-3 flex items-baseline justify-center gap-2">
                  <span className="font-display text-[2.6rem] leading-none gold-text">{buying.price}</span>
                  <span className="text-[13px] text-white/45">kr./md.</span>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-white/55">
                  {buying.seats} · {buying.take}
                </p>
                <div className="mt-5 rounded-lg border border-white/8 bg-white/[0.03] px-4 py-2.5 text-[11.5px] text-white/45">
                  🔒 Demo-miljø — der trækkes ingen rigtig betaling.
                </div>
                <button
                  onClick={confirm}
                  className="mt-6 w-full rounded-xl border border-brass/55 bg-gradient-to-r from-brass/35 to-brass/15 py-3.5 text-[14px] font-medium text-brass-soft transition hover:from-brass/50"
                >
                  Bekræft køb ⛓️
                </button>
                <button onClick={() => setBuying(null)} className="mt-2 w-full py-2 text-[12.5px] text-white/40">
                  Annullér
                </button>
              </>
            )}

            {phase === "processing" && (
              <div className="py-10">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-brass/25 border-t-brass" />
                <p className="mt-6 font-mono text-[11px] tracking-[0.25em] text-brass-soft/70 uppercase">Bekræfter adgang...</p>
              </div>
            )}

            {phase === "done" && (
              <>
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/12 text-[28px]">
                  👑
                </span>
                <h3 className="font-display mt-5 text-[2rem] leading-tight text-white">Køb accepteret!</h3>
                <p className="font-display mt-2 text-[1.3rem] text-brass-soft/90 italic">Velkommen til systemet. 🖤</p>
                <p className="mt-4 text-[13px] leading-relaxed text-white/55">
                  <span className="text-brass-soft">{buying.name}</span> er aktiveret. Dit hus står klar — nøgler,
                  kommandoer og tracker er låst op. ⛓️
                </p>
                <button
                  onClick={enterSystem}
                  className="mt-7 w-full rounded-xl border border-brass/55 bg-gradient-to-r from-brass/35 to-brass/15 py-3.5 text-[14px] font-medium text-brass-soft transition hover:from-brass/50"
                >
                  Åbn kontrolpanelet →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
