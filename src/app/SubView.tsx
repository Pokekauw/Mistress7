import { useEffect, useMemo, useRef, useState } from "react";
import Avatar, { AvatarPlate, SlaveAvatar } from "../components/Avatar";
import LocationCard from "../components/LocationCard";
import ConnBadge from "../components/ConnBadge";
import MediaBubble from "../components/MediaBubble";
import ConditionTimer from "../components/ConditionTimer";
import StatusBanner from "../components/StatusBanner";
import CommandLog from "../components/CommandLog";
import TelegramPanel from "../components/TelegramPanel";
import TelegramInline from "../components/TelegramInline";
import {
  avatarFor,
  bgStyle,
  chatBgFor,
  completePenance,
  declineDemand,
  fileToAttachment,
  HARD_LIMIT_OPTIONS,
  openLocReq,
  reverseGeocode,
  setFixPlace,
  shareLocation,
  submitProof,
  isGagged,
  isLocked,
  money,
  payTribute,
  rankOf,
  RITUALS,
  ritualState,
  safeword,
  setSession,
  setSpendCap,
  subRitual,
  subSay,
  timeLeft,
  toggleLimit,
  useStore,
  useTick,
} from "../lib/store";

export default function SubView({ slaveId, go }: { slaveId: string; go: (r: string) => void }) {
  useTick();
  const slave = useStore((s) => s.slaves.find((x) => x.id === slaveId) ?? null);
  const dungeon = useStore((s) => s.dungeon);
  const allMsgs = useStore((s) => s.messages);
  const msgs = useMemo(
    () => (slave ? allMsgs.filter((m) => m.slaveId === slave.id).sort((a, b) => a.time - b.time) : []),
    [allMsgs, slave]
  );
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<null | "tribute" | "limits" | "proof" | "key" | "telegram">(null);
  const [amt, setAmt] = useState(150);
  const [proofFile, setProofFile] = useState<{
    name: string;
    url: string | null;
    mime: string;
    size: number;
    path?: string | null;
  } | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [origKb, setOrigKb] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [showLog, setShowLog] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [holdPct, setHoldPct] = useState(0);
  const holdRef = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  /* profile deleted, or she took the key — enforced live from her device */
  const shut = !slave || slave.access !== "active";
  if (shut) {
    const revoked = slave?.access === "revoked";
    const suspended = slave?.access === "suspended";
    return (
      <div className="page-canvas relative flex min-h-screen items-center justify-center px-6">
        <div className="relative z-10 w-full max-w-sm text-center">
          <span
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-[28px] ${
              suspended ? "border-amber-400/40 bg-amber-500/10" : "border-rose-400/40 bg-rose-500/10"
            }`}
          >
            {suspended ? "⏸️" : "⛔"}
          </span>

          <div className="font-display mt-5 text-[2.1rem] leading-tight text-white/90">
            {suspended ? "She has stopped you." : "The door is closed."}
          </div>

          <p className="mt-3 text-[14px] leading-relaxed text-white/55">
            {slave?.accessNote?.trim() ||
              (suspended
                ? "Your access is suspended. Your code is still yours — she simply will not turn it."
                : revoked
                  ? "Your key has been taken. You are not permitted here."
                  : "You are no longer part of this house.")}
          </p>

          {slave && (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/30 py-4">
              <div className="label">Your code</div>
              <div className="mt-1 font-mono text-[1.4rem] tracking-[0.26em] text-white/30 line-through">
                {slave.accessCode}
              </div>
              <div className="mt-1.5 text-[11px] text-white/35">
                {suspended ? "⏸️ Dormant until she says otherwise" : "⛔ Refused at the door"}
              </div>
            </div>
          )}

          <p className="mt-5 font-display text-[13px] text-brass-soft/60 italic">
            Wait. That is all you can do. 🖤
          </p>

          <button
            onClick={() => {
              setSession({ role: null, slaveId: null });
              go("#/gate");
            }}
            className="mt-6 rounded-full border border-white/15 px-5 py-2.5 text-[13px] text-white/60"
          >
            Leave
          </button>
        </div>
      </div>
    );
  }

  const gagged = isGagged(slave);
  const locked = isLocked(slave);
  /* tributes he has offered that she has not judged yet */
  const pendingOffers = msgs.filter((m) => m.kind === "tribute" && m.verdict === "pending");
  const offeredDemandIds = new Set(pendingOffers.map((m) => m.demandId).filter(Boolean) as string[]);
  /* a demand with an offer in flight is not shown as still owed */
  const pending = msgs.filter((m) => m.kind === "demand" && m.status === "pending" && !offeredDemandIds.has(m.id));
  const pendingProof = msgs.some((m) => m.kind === "proof" && m.verdict === "pending");

  const send = () => {
    if (!text.trim()) return;
    const r = subSay(slave.id, text.trim());
    if (!r.ok) {
      setErr(r.error || "");
      setTimeout(() => setErr(""), 2600);
      setText("");
      return;
    }
    setText("");
  };

  const pay = (amount: number, demandId?: string) => {
    const r = payTribute(slave.id, amount, demandId);
    if (!r.ok) {
      setErr(r.error || "");
      setTimeout(() => setErr(""), 3600);
    } else {
      setSheet(null);
    }
  };

  /* ---------- location ---------- */
  const locReq = useStore((s) => (slave ? openLocReq(s, slave.id) : undefined));
  const [locBusy, setLocBusy] = useState(false);

  const pinLocation = () => {
    if (!slave) return;
    if (slave.hardLimits.includes("location tracking")) {
      setErr("📍 Location tracking is one of your hard limits. Remove it in Limits to allow this.");
      setTimeout(() => setErr(""), 4000);
      return;
    }
    if (!("geolocation" in navigator)) {
      setErr("This device cannot share a location.");
      setTimeout(() => setErr(""), 3000);
      return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy || 0,
          at: Date.now(),
        };
        shareLocation(slave.id, fix);
        setLocBusy(false);
        const place = await reverseGeocode(fix.lat, fix.lng);
        if (place) setFixPlace(slave.id, fix.at, place);
      },
      (e) => {
        setLocBusy(false);
        setErr(
          e.code === e.PERMISSION_DENIED
            ? "📍 You denied location access. She will be told nothing — and the window keeps running."
            : "📍 Could not obtain a fix. Try again outdoors."
        );
        setTimeout(() => setErr(""), 4500);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  /* press-and-hold safeword */
  const startHold = () => {
    const t0 = Date.now();
    holdRef.current = window.setInterval(() => {
      const p = Math.min(100, ((Date.now() - t0) / 1200) * 100);
      setHoldPct(p);
      if (p >= 100) {
        stopHold();
        safeword(slave.id);
        setErr("");
      }
    }, 30);
  };
  const stopHold = () => {
    if (holdRef.current) clearInterval(holdRef.current);
    holdRef.current = null;
    setHoldPct(0);
  };

  return (
    <div className="page-canvas relative flex min-h-screen flex-col">
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4">
        {/* header */}
        <header className="flex items-center gap-3 py-4">
          <AvatarPlate name={dungeon.name} honorific={dungeon.honorific} src={dungeon.avatarUrl} />
          <span className="flex-1" />
          <ConnBadge />
          <button
            onClick={() => setSheet("key")}
            className="hidden text-right sm:block"
            title="Your permanent code"
          >
            <div className="label">You 🖤</div>
            <div className="font-display text-[1rem] leading-none text-white/70">
              {slave.name} · <span className="text-brass-soft/80">{rankOf(slave.devotion)}</span>
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.16em] text-brass/60">🗝️ {slave.accessCode}</div>
          </button>
          <button
            onClick={() => setSheet("telegram")}
            title="Telegram alerts"
            className={`rounded-full border px-3 py-1.5 text-[11.5px] ${
              slave.telegram ? "border-emerald-400/40 text-emerald-200" : "border-white/12 text-white/55"
            }`}
          >
            {slave.telegram ? "🔔" : "🔕"}
          </button>
          <button onClick={() => setSheet("limits")} className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-white/55">
            Limits
          </button>
          <button
            onClick={() => {
              setSession({ role: null, slaveId: null });
              go("#/");
            }}
            className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-white/55"
          >
            Exit
          </button>
        </header>

        {/* conditions */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { l: "🖤 Devotion", v: String(slave.devotion), tone: "gold" },
            { l: "💥 Strikes", v: String(slave.strikes), tone: slave.strikes > 2 ? "red" : "muted" },
            { l: "🤐 Gag", v: gagged ? timeLeft(slave.gagUntil - Date.now()) : "—", tone: gagged ? "amber" : "muted" },
            {
              l: "📍 Missed",
              v: String(slave.locMisses || 0),
              tone: (slave.locMisses || 0) > 0 ? "red" : "muted",
            },
            { l: "🔒 Chastity", v: locked ? timeLeft(slave.lockUntil - Date.now()) : "—", tone: locked ? "violet" : "muted" },
          ].map((c) => (
            <div
              key={c.l}
              className={`rounded-lg border px-2 py-2 text-center ${
                c.tone === "gold"
                  ? "border-brass/30 bg-brass/8"
                  : c.tone === "red"
                    ? "border-rose-400/30 bg-rose-500/8"
                    : c.tone === "amber"
                      ? "border-amber-400/30 bg-amber-500/8"
                      : c.tone === "violet"
                        ? "border-violet-400/30 bg-violet-500/8"
                        : "border-white/8 bg-white/[0.02]"
              }`}
            >
              <div className="label !text-[8.5px]">{c.l}</div>
              <div className="font-display mt-0.5 text-[1.1rem] text-white/90">{c.v}</div>
            </div>
          ))}
        </div>

        {/* ---------- status & compliance ---------- */}
        <div className="mt-2">
          <StatusBanner
            slave={slave}
            pendingProof={pendingProof}
            openCheckIn={locReq}
            pendingTribute={pending[0]}
            onAct={(what) => {
              if (what === "proof") setSheet("proof");
              else if (what === "tribute") setSheet("tribute");
              else void pinLocation();
            }}
          />
        </div>

        {/* live countdowns, only while they run */}
        {(gagged || locked) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {gagged && <ConditionTimer slave={slave} what="gag" canControl={false} />}
            {locked && <ConditionTimer slave={slave} what="lock" canControl={false} />}
          </div>
        )}

        {/* penance actions live beside the banner entry */}
        {slave.penance && !pendingProof && (
          <button
            onClick={() => completePenance(slave.id)}
            className="mt-2 w-full rounded-lg border border-white/12 py-2 text-[11.5px] text-white/55 transition hover:border-white/25"
          >
            Report complete without proof
          </button>
        )}

        {/* pending demands */}
        {pending.map((d) => (
          <div key={d.id} className="mt-2 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3">
            <div className="label">💰 Tribute Demanded</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-display text-[1.8rem] gold-text">{money(d.amount || 0)}</span>
              <span className="flex-1" />
              <button onClick={() => declineDemand(slave.id, d.id)} className="rounded-md border border-white/15 px-3 py-1.5 text-[11.5px] text-white/60">
                Decline
              </button>
              <button onClick={() => pay(d.amount || 0, d.id)} className="rounded-md border border-brass/50 bg-brass/20 px-4 py-1.5 text-[11.5px] text-brass-soft">
                Render Tribute
              </button>
            </div>
          </div>
        ))}

        {/* tributes offered, awaiting her accept / reject */}
        {pendingOffers.map((o) => (
          <div key={o.id} className="mt-2 rounded-lg border border-amber-400/45 bg-amber-500/10 px-4 py-3 text-center">
            <div className="label !text-amber-200/85">💰 Tribute offered · {money(o.amount || 0)}</div>
            <div className="mt-0.5 text-[11.5px] leading-relaxed text-amber-100/75">
              Awaiting her acceptance. Nothing is recorded until she approves it. ⏳
            </div>
          </div>
        ))}

        {/* thread */}
        <div
          className="thin-scroll mt-3 flex-1 space-y-2.5 overflow-y-auto rounded-xl border border-white/8 p-3"
          style={bgStyle(chatBgFor(slave, dungeon))}
        >
          {msgs.map((m) => {
            if (m.kind === "system" || m.kind === "refusal")
              return (
                <div key={m.id} className="rounded-lg border-l-2 border-white/20 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-white/55">
                  {m.text}
                </div>
              );
            if (m.kind === "decree")
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2.5 text-center ${
                    m.from === "mistress" ? "border-brass/35 bg-brass/8" : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  {m.title && (
                    <div
                      className={`font-mono text-[9.5px] tracking-[0.16em] uppercase ${
                        m.from === "mistress" ? "text-brass/80" : "text-white/40"
                      }`}
                    >
                      {m.title}
                    </div>
                  )}
                  <div
                    className={`text-[13px] leading-snug italic ${m.title ? "mt-1" : ""} ${
                      m.from === "mistress" ? "text-brass-soft/90" : "text-white/55"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            if (m.kind === "tribute") {
              const offered = m.verdict === "pending";
              const rejected = m.verdict === "rejected";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2 text-center ${
                    offered
                      ? "border-amber-400/45 bg-amber-500/10"
                      : rejected
                        ? "border-rose-400/40 bg-rose-500/8"
                        : "border-brass/35 bg-brass/10"
                  }`}
                >
                  <div className="label">{offered ? "Tribute offered" : rejected ? "Tribute declined" : "Recorded"}</div>
                  <div
                    className={`font-display text-[1.2rem] ${
                      offered ? "text-amber-200" : rejected ? "text-rose-200/80" : "text-brass-soft"
                    }`}
                  >
                    {money(m.amount || 0)}
                  </div>
                  {offered && <div className="mt-0.5 text-[10.5px] text-amber-100/70">awaiting her judgement ⏳</div>}
                  {rejected && <div className="mt-0.5 text-[10.5px] text-rose-100/65">not recorded</div>}
                </div>
              );
            }
            if (m.kind === "demand")
              return (
                <div key={m.id} className="text-center text-[11.5px] text-white/40">
                  💰 tribute demanded {money(m.amount || 0)} · {m.status}
                </div>
              );
            if (m.kind === "locreq")
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2.5 text-center text-[12.5px] ${
                    m.locState === "fulfilled"
                      ? "border-emerald-400/30 bg-emerald-500/8 text-emerald-100/85"
                      : m.locState === "expired"
                        ? "border-rose-400/40 bg-rose-500/8 text-rose-100/85"
                        : "border-amber-400/35 bg-amber-500/8 text-amber-100/85"
                  }`}
                >
                  <div className="italic">
                    📍 {dungeon.honorific} {m.text}
                  </div>
                  <div className="mt-1 font-mono text-[10px] tracking-wider uppercase opacity-70">
                    {m.locState === "fulfilled"
                      ? "you complied ✅"
                      : m.locState === "expired"
                        ? "you failed — penalised ⛓️"
                        : `${timeLeft((m.deadline || 0) - Date.now())} left ⏳`}
                  </div>
                </div>
              );
            if (m.kind === "location" && m.fix)
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="w-full max-w-[85%]">
                    <LocationCard fix={m.fix} compact />
                  </div>
                </div>
              );
            if (m.kind === "media") return <MediaBubble key={m.id} m={m} slaveId={slave.id} side="left" />;
            if (m.kind === "proof")
              return (
                <div key={m.id} className="rounded-xl border border-violet-400/30 bg-violet-500/8 p-3">
                  <div className="flex items-center gap-2">
                    <span className="label !text-violet-200/75">📸 Your proof</span>
                    <span className="flex-1" />
                    <span
                      className={`font-mono text-[10px] uppercase ${
                        m.verdict === "accepted" ? "text-emerald-300" : m.verdict === "rejected" ? "text-rose-300" : "text-amber-300"
                      }`}
                    >
                      {m.verdict === "pending" ? "awaiting judgement" : m.verdict}
                    </span>
                  </div>
                  {m.file?.url ? (
                    <img
                      src={m.file.url}
                      alt="proof"
                      loading="lazy"
                      className="mt-2 max-h-56 w-full rounded-lg border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-[12px] text-white/55">
                      📎 {m.file?.name || "file"} · {Math.round((m.file?.size || 0) / 1024)} KB
                    </div>
                  )}
                  {m.text && <p className="mt-2 text-[12.5px] text-white/70">{m.text}</p>}
                </div>
              );
            const mine = m.from === "sub";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <Avatar size={30} src={dungeon.avatarUrl} />}
                <div
                  className={`max-w-[76%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
                    mine
                      ? "rounded-br-md border border-white/10 bg-white/[0.06] text-white/80"
                      : "font-display rounded-bl-md border border-brass/25 bg-gradient-to-br from-brass/25 to-brass/10 text-brass-soft"
                  }`}
                >
                  {m.text}
                </div>
                {mine && <SlaveAvatar size={28} src={avatarFor(slave, dungeon)} name={slave.name} />}
              </div>
            );
          })}
          <div ref={end} />
        </div>

        {err && <div className="mt-2 rounded-lg border border-rose-400/35 bg-rose-950/40 px-4 py-2.5 text-[12.5px] text-rose-100">{err}</div>}
        {note && !err && (
          <div className="mt-2 rounded-lg border border-brass/35 bg-brass/10 px-4 py-2.5 text-[12.5px] text-brass-soft">{note}</div>
        )}

        {/* telegram — inline in the chat, where he will actually see it */}
        <TelegramInline slave={slave} />

        {/* command log */}
        <button
          onClick={() => setShowLog((v) => !v)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-white/10 px-3.5 py-2 text-[11.5px] text-white/50 transition hover:border-brass/35 hover:text-brass-soft"
        >
          <span>📜</span>
          <span>Command Log</span>
          <span className="flex-1" />
          <span className={`transition-transform ${showLog ? "rotate-180" : ""}`}>⌄</span>
        </button>
        {showLog && (
          <div className="mt-2">
            <CommandLog messages={msgs} title="Orders & Outcomes" limit={30} />
          </div>
        )}

        {/* rituals — each button earns its devotion at most once per 24h */}
        <div className="thin-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
          {RITUALS.map((r) => {
            const st = ritualState(slave, r.id);
            const cooling = !st.earned;
            return (
              <button
                key={r.id}
                onClick={() => {
                  const res = subRitual(slave.id, r.id);
                  if (res && !res.earned) {
                    setNote(
                      `${r.icon} ${r.label} has already earned devotion today · available again in ${timeLeft(
                        res.resetsAt - Date.now()
                      )}`
                    );
                    setTimeout(() => setNote(""), 3400);
                  }
                }}
                title={cooling ? `Devotion already earned · again in ${timeLeft(st.resetsAt - Date.now())}` : `+${r.dev} devotion once per day`}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] transition active:scale-95 ${
                  cooling
                    ? "border-white/8 bg-white/[0.02] text-white/40 hover:border-amber-400/35"
                    : "border-white/12 bg-white/[0.04] text-white/70 hover:border-brass/40 hover:text-brass-soft"
                }`}
              >
                <span className="mr-1.5 opacity-70">{r.icon}</span>
                {r.label}
                {cooling && (
                  <span className="ml-1.5 font-mono text-[9.5px] text-amber-200/85">
                    ♥✓ {timeLeft(st.resetsAt - Date.now())}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={pinLocation}
            disabled={locBusy}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-[12px] transition active:scale-95 disabled:opacity-50 ${
              locReq
                ? "animate-pulse border-amber-400/60 bg-amber-500/20 text-amber-100"
                : "border-emerald-400/45 bg-emerald-500/12 text-emerald-200"
            }`}
          >
            {locBusy ? "⏳ Locating..." : "📍 Share location"}
          </button>
          <button
            onClick={() => setSheet("proof")}
            className="shrink-0 rounded-full border border-violet-400/45 bg-violet-500/12 px-3.5 py-2 text-[12px] text-violet-200"
          >
            📸 Submit proof
          </button>
          <button
            onClick={() => setSheet("tribute")}
            className="shrink-0 rounded-full border border-brass/45 bg-brass/12 px-3.5 py-2 text-[12px] text-brass-soft"
          >
            💰 Tribute
          </button>
        </div>

        {/* composer */}
        <div className="mt-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={gagged ? "you are gagged — she decides when you may speak" : `speak to ${dungeon.honorific}...`}
            className={`flex-1 rounded-full border px-4 py-3 text-[15px] outline-none transition ${
              gagged ? "border-amber-400/50 bg-amber-500/10 text-amber-100 placeholder:text-amber-200/60" : "border-white/12 bg-black/40 focus:border-brass/50"
            }`}
          />
          <button onClick={send} className="rounded-full border border-brass/45 bg-brass/15 px-5 text-[13px] text-brass-soft">
            Send
          </button>
        </div>

        {/* safeword */}
        <button
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          className="relative mt-2 overflow-hidden rounded-full border border-rose-400/35 bg-rose-950/25 py-2.5 text-center font-mono text-[11px] tracking-[0.3em] text-rose-200/80 uppercase select-none"
        >
          <span className="absolute inset-y-0 left-0 bg-rose-500/30 transition-none" style={{ width: `${holdPct}%` }} />
          <span className="relative">hold to safeword · red</span>
        </button>
      </div>

      {/* tribute sheet */}
      {sheet === "tribute" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setSheet(null)}>
          <div className="card w-full max-w-sm rounded-t-2xl p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="label">Offer tribute</div>
            <p className="mt-1.5 text-[12.5px] text-white/50">
              Spent this month {money(slave.spentThisMonth)} of {money(slave.spendCap)} cap.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[50, 150, 500, 1500].map((a) => (
                <button
                  key={a}
                  onClick={() => setAmt(a)}
                  className={`rounded-lg border py-3 text-[13px] transition ${
                    amt === a ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/12 text-white/55"
                  }`}
                >
                  ${a}
                </button>
              ))}
            </div>
            <button onClick={() => pay(amt)} className="mt-4 w-full rounded-lg border border-brass/50 bg-brass/18 py-3 text-[13.5px] text-brass-soft">
              Offer {money(amt)}
            </button>
            <button onClick={() => setSheet(null)} className="mt-2 w-full py-2 text-[12.5px] text-white/40">
              Not now
            </button>
          </div>
        </div>
      )}

      {/* proof sheet */}
      {sheet === "proof" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center" onClick={() => setSheet(null)}>
          <div
            className="thin-scroll max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-violet-400/25 bg-gradient-to-b from-[#161022] to-[#0b0709] p-6 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[1.5rem] text-white">📸 Proof of compliance</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">
              {slave.penance ? (
                <>
                  Outstanding penance: <span className="text-rose-200">{slave.penance}</span>
                </>
              ) : (
                "Show her that you obeyed. She will judge it."
              )}
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*,.pdf"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;

                /* show it instantly from the local file, then upload */
                setUploadErr("");
                setLocalPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
                setOrigKb(Math.round(f.size / 1024));
                setBusy(true);

                const r = await fileToAttachment(f);
                setBusy(false);

                if ("error" in r) {
                  setUploadErr(r.error);
                  setLocalPreview(null);
                  return;
                }
                setProofFile(r);
              }}
            />

            {proofFile || busy || localPreview ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-brass/25 bg-black/35">
                <div className="relative">
                  {localPreview ? (
                    <img src={localPreview} alt="preview" className="max-h-52 w-full object-cover" />
                  ) : (
                    <div className="py-8 text-center text-[13px] text-white/60">📎 {proofFile?.name}</div>
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brass/25 border-t-brass" />
                      <span className="font-mono text-[10px] tracking-[0.2em] text-brass-soft/80 uppercase">
                        Compressing &amp; uploading
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-white/8 px-3 py-2">
                  {proofFile ? (
                    <span className="flex-1 truncate font-mono text-[10.5px] text-emerald-300/80">
                      ✓ {origKb} KB → {Math.round(proofFile.size / 1024)} KB
                      {proofFile.path ? " · stored" : " · inline"}
                    </span>
                  ) : (
                    <span className="flex-1 truncate font-mono text-[10.5px] text-white/40">{origKb} KB</span>
                  )}
                  {!busy && (
                    <button
                      onClick={() => {
                        setProofFile(null);
                        setLocalPreview(null);
                        setUploadErr("");
                      }}
                      className="text-[11px] text-rose-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="group mt-4 w-full rounded-xl border border-dashed border-brass/35 bg-gradient-to-b from-brass/8 to-transparent py-10 text-center transition hover:border-brass/60 hover:from-brass/14"
              >
                <div className="text-[28px]">📤</div>
                <div className="mt-2 text-[13px] text-brass-soft/90">Choose a photo</div>
                <div className="mt-1 text-[11px] text-white/35">
                  Compressed on your device · any size accepted
                </div>
              </button>
            )}

            {uploadErr && (
              <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-950/40 px-3.5 py-2.5">
                <p className="text-[12px] leading-snug text-rose-100">{uploadErr}</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/70"
                >
                  Try another photo
                </button>
              </div>
            )}

            <div className="label mt-4">A word with it</div>
            <textarea
              rows={2}
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              placeholder="It is done, Mistress. 🖤"
              className="mt-2 w-full resize-none rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[13.5px] outline-none focus:border-violet-400/50"
            />

            <button
              disabled={!proofFile}
              onClick={() => {
                if (!proofFile) return;
                submitProof(slave.id, proofFile, proofNote.trim());
                setProofFile(null);
                setProofNote("");
                setSheet(null);
              }}
              className={`mt-4 w-full rounded-lg border py-3 text-[13.5px] transition ${
                proofFile
                  ? "border-violet-400/50 bg-violet-500/18 text-violet-100"
                  : "cursor-not-allowed border-white/8 text-white/25"
              }`}
            >
              Submit for judgement ⛓️
            </button>
            <button onClick={() => setSheet(null)} className="mt-2 w-full py-2 text-[12.5px] text-white/40">
              Cancel
            </button>
          </div>
        </div>
      )}

      {sheet === "telegram" && <TelegramPanel slave={slave} onClose={() => setSheet(null)} />}

      {/* permanent code sheet */}
      {sheet === "key" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center" onClick={() => setSheet(null)}>
          <div className="card w-full max-w-sm rounded-t-2xl p-6 text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brass/45 bg-brass/10 text-[24px]">
              🗝️
            </span>
            <h3 className="font-display mt-4 text-[1.5rem] text-white">Your permanent code</h3>
            <div className="mt-4 rounded-xl border border-brass/40 bg-brass/10 py-5 font-mono text-[1.9rem] tracking-[0.26em] text-brass-soft">
              {slave.accessCode}
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">
              This is yours for as long as she allows it. Use it every time you return — it never expires.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-brass-soft/70 italic">
              She can take it from you at any moment, without warning. ⛓️
            </p>
            <button onClick={() => setSheet(null)} className="mt-5 w-full rounded-lg border border-white/12 py-2.5 text-[13px] text-white/60">
              Close
            </button>
          </div>
        </div>
      )}

      {/* limits sheet */}
      {sheet === "limits" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setSheet(null)}>
          <div className="card w-full max-w-sm rounded-t-2xl p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-[1.4rem] text-white">Your limits</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
              Enforced by the engine, not by etiquette. She cannot override these.
            </p>
            <div className="mt-4 space-y-2">
              {HARD_LIMIT_OPTIONS.map((l) => {
                const on = slave.hardLimits.includes(l);
                return (
                  <button
                    key={l}
                    onClick={() => toggleLimit(slave.id, l)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-[13px] transition ${
                      on ? "border-rose-400/40 bg-rose-500/8 text-rose-100" : "border-white/10 text-white/50"
                    }`}
                  >
                    {l}
                    <span className="font-mono text-[10px]">{on ? "HARD LIMIT" : "allowed"}</span>
                  </button>
                );
              })}
            </div>

            <div className="label mt-5">Monthly spend cap</div>
            <input
              type="range"
              min={100}
              max={6000}
              step={100}
              value={slave.spendCap}
              onChange={(e) => setSpendCap(slave.id, Number(e.target.value))}
              className="mt-3 w-full"
            />
            <div className="mt-1 text-right font-mono text-[13px] text-brass-soft">{money(slave.spendCap)}/mo</div>

            <button onClick={() => setSheet(null)} className="mt-5 w-full rounded-lg border border-white/12 py-2.5 text-[13px] text-white/60">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
