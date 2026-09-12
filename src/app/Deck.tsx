import { useEffect, useMemo, useRef, useState } from "react";
import Avatar, { AvatarPlate, SlaveAvatar } from "../components/Avatar";
import LocationCard from "../components/LocationCard";
import ConnBadge from "../components/ConnBadge";
import MediaBubble from "../components/MediaBubble";
import MediaComposer from "../components/MediaComposer";
import ImagePicker from "../components/ImagePicker";
import BgPicker from "../components/BgPicker";
import Billing from "../components/Billing";
import { fsFetchInvite, fsPurgeLegacy, INVITE_TTL, inviteLink, inviteStatus, type Invite } from "../lib/invites";
import { planRequiredFor } from "../lib/plans";
import { botUrl, resolveBotUsername } from "../lib/telegram";
import { HOUSE_ID, isFirebase } from "../firebase";
import SlaveDrawer from "../components/SlaveDrawer";
import StrikeModal from "../components/StrikeModal";
import PunishmentWheel from "../components/PunishmentWheel";
import {
  ACCESS_LOOK,
  attentionDebt,
  attentionDeadline,
  avatarFor,
  bgStyle,
  chatBgFor,
  clearChat,
  DEFAULT_BG,
  has,
  judgeTribute,
  setHouseAvatars,
  setHouseChatBg,
  setTelegramBot,
  CHECKIN_WINDOWS,
  rotateAccessCode,
  setAccess,
  type AccessState,
  COMMANDS,
  DECREE_PRESETS,
  DURATIONS,
  fireCommand,
  fmtMins,
  freezeHouse,
  isGagged,
  isLocked,
  judgeProof,
  generateInvite,
  revokeInvite,
  deleteInvite,
  PENANCE_PRESETS,
  money,
  rankOf,

  saveDungeon,
  sendMistressText,
  setSession,
  timeLeft,
  useStore,
  useTick,
  type CommandId,
  type Msg,
  type Slave,
  type Tier,
} from "../lib/store";

/* ---------------- small parts ---------------- */
function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const pts = data.map((d, i) => `${(i / Math.max(1, data.length - 1)) * 100},${26 - (d / max) * 24}`).join(" ");
  const falling = data[data.length - 1] < data[0];
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-5 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke={falling ? "rgba(251,113,133,.85)" : "rgba(201,162,39,.9)"}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SlaveCard({ s, on, onClick, avatar }: { s: Slave; on: boolean; onClick: () => void; avatar: string }) {
  const debt = attentionDebt(s);
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition ${
        on ? "border-brass/70 bg-brass/10" : "border-white/8 bg-white/[0.025] hover:border-white/25"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SlaveAvatar size={30} src={avatar} name={s.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {s.access !== "active" && (
                <span title={`Access ${s.access}`} className="text-[11px]">
                  {ACCESS_LOOK[s.access].icon}
                </span>
              )}
              <span className={`truncate font-mono text-[12.5px] ${s.access === "active" ? "text-white/90" : "text-white/40"}`}>
                {s.name}
              </span>
            </div>
            <div className="label mt-0.5">
              {s.tier} · {rankOf(s.devotion)}
            </div>
          </div>
        </div>
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[9px] ${
            on ? "border-brass bg-brass text-[#0a0709]" : "border-white/20"
          }`}
        >
          {on ? "✓" : ""}
        </span>
      </div>

      <Spark data={s.history} />

      <div className="flex items-center justify-between font-mono text-[10px] text-white/45">
        <span className="text-brass-soft/85">♥ {s.devotion}</span>
        <span className={s.strikes > 2 ? "text-rose-300" : ""}>✕ {s.strikes}</span>
        <span>{money(s.ltv)}</span>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="label !text-[8.5px]">
            attention debt · due {timeLeft(Math.max(0, attentionDeadline(s) - Date.now())) || "now"}
          </span>
          <span className="flex gap-1 font-mono text-[9.5px] text-brass/85">
            {s.telegram && <span title="Telegram linked">🔔</span>}
            {isGagged(s) && <span>◌ {timeLeft(s.gagUntil - Date.now())}</span>}
            {isLocked(s) && <span>⌾ {timeLeft(s.lockUntil - Date.now())}</span>}
            {s.penance && <span className="text-rose-300">☓</span>}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full transition-all ${debt > 70 ? "bg-rose-400/80" : debt > 40 ? "bg-amber-400/70" : "bg-brass/70"}`}
            style={{ width: `${debt}%` }}
          />
        </div>
      </div>
    </button>
  );
}

/* ---------------- chat panel ---------------- */
function Thread({ slave }: { slave: Slave }) {
  const all = useStore((s) => s.messages);
  const msgs = useMemo(
    () => all.filter((m) => m.slaveId === slave.id).sort((a, b) => a.time - b.time),
    [all, slave.id]
  );
  const dungeon = useStore((s) => s.dungeon);
  const [text, setText] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  /* demands that currently have a tribute offer waiting on her verdict */
  const offerByDemand = useMemo(() => {
    const map = new Map<string, Msg>();
    all.forEach((m) => {
      if (m.kind === "tribute" && m.verdict === "pending" && m.demandId) map.set(m.demandId, m);
    });
    return map;
  }, [all]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const send = () => {
    if (!text.trim()) return;
    sendMistressText(slave.id, text.trim());
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col" style={bgStyle(chatBgFor(slave, dungeon))}>
      <div className="thin-scroll flex-1 space-y-2.5 overflow-y-auto p-4">
        {msgs.length === 0 && <p className="pt-8 text-center text-[13px] text-white/30">Nothing has been said yet. 🖤</p>}
        {msgs.map((m) => {
          if (m.kind === "system" || m.kind === "refusal")
            return (
              <div
                key={m.id}
                className={`rounded-lg border-l-2 px-3 py-2 text-[12px] leading-relaxed ${
                  m.kind === "refusal" ? "border-rose-400/70 bg-rose-500/8 text-rose-100/85" : "border-white/20 bg-white/[0.03] text-white/55"
                }`}
              >
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
                    {m.from === "mistress" ? `: ${slave.name}` : ""}
                  </div>
                )}
                <div
                  className={`text-[12.5px] leading-snug italic ${m.title ? "mt-1" : ""} ${
                    m.from === "mistress" ? "text-brass-soft/90" : "text-white/60"
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
                className={`rounded-lg border px-3 py-2.5 text-center ${
                  offered
                    ? "border-amber-400/50 bg-amber-500/10"
                    : rejected
                      ? "border-rose-400/40 bg-rose-500/8"
                      : "border-brass/40 bg-brass/12"
                }`}
              >
                <div className="label">
                  {offered ? "💰 Tribute offered — awaiting your verdict" : rejected ? "💰 Tribute declined" : "💰 Tribute Received"}
                </div>
                <div
                  className={`font-display text-[1.4rem] ${offered ? "text-amber-200" : rejected ? "text-rose-200/80" : "gold-text"}`}
                >
                  {money(m.amount || 0)}
                </div>
                {offered && (
                  <div className="mx-auto mt-2 flex max-w-xs gap-2">
                    <button
                      onClick={() => {
                        const r = judgeTribute(m.id, false);
                        if (!r.ok && r.error) alert(r.error);
                      }}
                      className="flex-1 rounded-md border border-rose-400/40 bg-rose-500/10 py-1.5 text-[11.5px] text-rose-200 transition hover:bg-rose-500/20"
                    >
                      ❌ Reject
                    </button>
                    <button
                      onClick={() => {
                        const r = judgeTribute(m.id, true);
                        if (!r.ok && r.error) alert(r.error);
                      }}
                      className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 py-1.5 text-[11.5px] text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      ✅ Accept
                    </button>
                  </div>
                )}
                {rejected && <div className="mt-0.5 text-[10.5px] text-rose-100/60">not on record</div>}
              </div>
            );
          }
          if (m.kind === "demand") {
            const pendingOffer = offerByDemand.get(m.id);
            return (
              <div key={m.id} className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-center text-[12px] text-white/60">
                💰 Tribute Demanded: {money(m.amount || 0)} —{" "}
                <span className={m.status === "paid" ? "text-emerald-300" : m.status === "declined" ? "text-rose-300" : "text-amber-300"}>
                  {m.status === "paid"
                    ? "paid"
                    : m.status === "declined"
                      ? "declined"
                      : pendingOffer
                        ? "tribute offered · accept it below ⬇"
                        : "awaiting payment"}
                </span>
              </div>
            );
          }
          if (m.kind === "locreq") {
            const late = m.locState === "pending" && (m.deadline || 0) < Date.now();
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
                <div className="font-mono text-[9.5px] tracking-[0.16em] uppercase opacity-75">
                  Check-In Demanded: {slave.name}
                </div>
                <div className="mt-1 italic">📍 {m.text}</div>
                <div className="mt-1 font-mono text-[10px] tracking-wider uppercase opacity-70">
                  {m.locState === "fulfilled"
                    ? "Answered ✅"
                    : m.locState === "expired"
                      ? "Expired — penalty applied ⛓️"
                      : late
                        ? "Closing…"
                        : `${timeLeft((m.deadline || 0) - Date.now())} remaining ⏳`}
                </div>
              </div>
            );
          }
          if (m.kind === "location" && m.fix)
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full max-w-[85%]">
                  <LocationCard fix={m.fix} compact />
                </div>
              </div>
            );
          if (m.kind === "media") return <MediaBubble key={m.id} m={m} side="right" />;
          if (m.kind === "proof")
            return (
              <div key={m.id} className="rounded-xl border border-violet-400/30 bg-violet-500/8 p-3">
                <div className="flex items-center gap-2">
                  <span className="label !text-violet-200/75">📸 Proof of Compliance</span>
                  <span className="flex-1" />
                  <span
                    className={`font-mono text-[10px] uppercase ${
                      m.verdict === "accepted" ? "text-emerald-300" : m.verdict === "rejected" ? "text-rose-300" : "text-amber-300"
                    }`}
                  >
                    {m.verdict === "pending" ? "Awaiting Judgement" : m.verdict}
                  </span>
                </div>
                {m.file?.url ? (
                  <img
                    src={m.file.url}
                    alt="proof"
                    loading="lazy"
                    onClick={() => setLightbox(m.file!.url)}
                    className="mt-2 max-h-52 w-full cursor-zoom-in rounded-lg border border-white/10 object-cover"
                  />
                ) : (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-[12px] text-white/55">
                    📎 {m.file?.name || "file"} · {Math.round((m.file?.size || 0) / 1024)} KB
                  </div>
                )}
                {m.text && <p className="mt-2 text-[12.5px] text-white/70">{m.text}</p>}
                {m.verdict === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => judgeProof(m.id, false)}
                      className="flex-1 rounded-md border border-rose-400/40 bg-rose-500/10 py-2 text-[12px] text-rose-200"
                    >
                      ❌ Reject
                    </button>
                    <button
                      onClick={() => judgeProof(m.id, true)}
                      className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 py-2 text-[12px] text-emerald-200"
                    >
                      ✅ Accept
                    </button>
                  </div>
                )}
              </div>
            );
          const mine = m.from === "mistress";
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && <SlaveAvatar size={28} src={avatarFor(slave, dungeon)} name={slave.name} />}
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-snug ${
                  mine
                    ? "font-display rounded-br-md border border-brass/25 bg-gradient-to-br from-brass/25 to-brass/10 text-brass-soft"
                    : "rounded-bl-md border border-white/10 bg-white/[0.05] text-white/80"
                }`}
              >
                {m.text}
              </div>
              {mine && <Avatar size={28} src={dungeon.avatarUrl} />}
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="flex gap-2 border-t border-white/8 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Address ${slave.name}…`}
          className="flex-1 rounded-full border border-white/12 bg-black/40 px-4 py-2.5 text-[14px] outline-none focus:border-brass/50"
        />
        <button onClick={send} className="rounded-full border border-brass/45 bg-brass/15 px-5 text-[13px] text-brass-soft">
          Send
        </button>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="proof" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

/* ---------------- keys tab ---------------- */
function AccessRow({ s }: { s: Slave }) {
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const look = ACCESS_LOOK[s.access];

  const tone =
    s.access === "active"
      ? "border-emerald-400/25 bg-emerald-500/[0.05]"
      : s.access === "suspended"
        ? "border-amber-400/30 bg-amber-500/[0.06]"
        : "border-rose-400/30 bg-rose-500/[0.06]";

  const copy = () => {
    navigator.clipboard?.writeText(s.accessCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className={`rounded-xl border p-4 transition ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] text-white/90">{s.name}</div>
          <div className="label mt-0.5">
            {s.tier} · ♥ {s.devotion}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase ${
            s.access === "active"
              ? "border-emerald-400/40 text-emerald-200"
              : s.access === "suspended"
                ? "border-amber-400/40 text-amber-200"
                : "border-rose-400/40 text-rose-200"
          }`}
        >
          {look.icon} {look.label}
        </span>
      </div>

      {/* the permanent code */}
      <button
        onClick={copy}
        title="Copy"
        className="mt-3 flex w-full items-center gap-3 rounded-lg border border-brass/25 bg-black/30 px-3.5 py-2.5 text-left transition hover:border-brass/55"
      >
        <span className="text-[13px]">🗝️</span>
        <span
          className={`flex-1 font-mono text-[1.15rem] tracking-[0.24em] ${
            s.access === "active" ? "text-brass-soft" : "text-white/35 line-through"
          }`}
        >
          {s.accessCode}
        </span>
        <span className="font-mono text-[9.5px] text-white/35 uppercase">{copied ? "copied ✓" : "permanent"}</span>
      </button>

      {s.accessNote && <p className="mt-2 text-[11.5px] text-white/45 italic">“{s.accessNote}”</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.access !== "active" && (
          <button
            onClick={() => setAccess(s.id, "active")}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200"
          >
            🗝️ Give it back
          </button>
        )}
        {s.access !== "suspended" && (
          <button
            onClick={() => {
              const note = prompt("Why is he suspended? (optional — he will read this)") ?? undefined;
              setAccess(s.id, "suspended", note);
            }}
            className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200"
          >
            ⏸️ Suspend
          </button>
        )}
        {s.access !== "revoked" && (
          <button
            onClick={() => {
              if (!confirm(`Take the key from ${s.name}?\n\nHis code ${s.accessCode} stays his — it simply stops working until you say otherwise.`)) return;
              const note = prompt("A word at the door? (optional)") ?? undefined;
              setAccess(s.id, "revoked", note);
            }}
            className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200"
          >
            ⛔ Take the key
          </button>
        )}
        <button onClick={() => setMenu((v) => !v)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-white/45">
          ⋯
        </button>
      </div>

      {menu && (
        <div className="mt-2 rounded-lg border border-white/8 bg-black/30 p-3">
          <p className="text-[11px] leading-relaxed text-white/45">
            Rotating issues a brand-new permanent code and kills the old one. Only do this if his code leaked —
            taking the key does <span className="text-white/70">not</span> require it.
          </p>
          <button
            onClick={() => {
              if (!confirm(`Issue a new permanent code for ${s.name}? The old one dies immediately.`)) return;
              rotateAccessCode(s.id);
              setMenu(false);
            }}
            className="mt-2 w-full rounded-md border border-white/12 py-2 text-[11.5px] text-white/60 hover:border-brass/45 hover:text-brass-soft"
          >
            ♻️ Rotate code
          </button>
        </div>
      )}
    </div>
  );
}

function InvitesTab() {
  const invites = useStore((s) => s.invites);
  const slaves = useStore((s) => s.slaves);
  const [tier, setTier] = useState<Tier>("Collared");
  const [bound, setBound] = useState("");
  const [ttl, setTtl] = useState(24);
  const [issued, setIssued] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<"key" | "link" | null>(null);
  const [probe, setProbe] = useState("");
  const [probeResult, setProbeResult] = useState("");
  const [filter, setFilter] = useState<"all" | AccessState>("all");

  const shown = slaves.filter((s) => filter === "all" || s.access === filter);
  const counts = {
    all: slaves.length,
    active: slaves.filter((s) => s.access === "active").length,
    suspended: slaves.filter((s) => s.access === "suspended").length,
    revoked: slaves.filter((s) => s.access === "revoked").length,
  };

  const copy = (text: string, what: "key" | "link") => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[340px_1fr]">
      {/* ---------- generate ---------- */}
      <div className="card h-fit rounded-xl p-5">
        <h3 className="font-display text-[1.4rem] text-white">Generate Invitation</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
          The only way into this house. Single use, and dead the moment it is redeemed.
        </p>

        <div className="label mt-5">Collar granted</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(["Kneeling", "Collared", "Owned"] as Tier[]).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`rounded-md border px-2 py-2 text-[11.5px] transition ${
                tier === t ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/10 text-white/50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="label mt-4">Valid for</div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {INVITE_TTL.map((o) => (
            <button
              key={o.label}
              onClick={() => setTtl(o.h)}
              className={`rounded-md border px-1 py-2 text-[10.5px] transition ${
                ttl === o.h ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/10 text-white/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="label mt-4">Reserve for a name (optional)</div>
        <input
          value={bound}
          onChange={(e) => setBound(e.target.value)}
          placeholder="anyone may redeem it"
          className="mt-2 w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[13.5px] outline-none focus:border-brass/50"
        />

        <button
          onClick={() => setIssued(generateInvite({ tier, boundName: bound, ttlHours: ttl }))}
          className="mt-4 w-full rounded-lg border border-brass/50 bg-gradient-to-r from-brass/30 to-brass/12 py-3 text-[13px] font-medium text-brass-soft transition hover:from-brass/45"
        >
          ⛓️ Generate Invite
        </button>

        {issued && (
          <div className="mt-4 rounded-xl border border-brass/40 bg-gradient-to-br from-[#1a1016] to-[#0b0709] p-5 text-center">
            <div className="label">Issue this to him</div>
            <div className="mt-2 font-mono text-[1.6rem] tracking-[0.22em] text-brass-soft">{issued.key}</div>
            <div className="mt-1 font-mono text-[10px] text-white/35">
              {issued.tier}
              {issued.boundName ? ` · reserved for ${issued.boundName}` : ""}
              {issued.expiresAt ? ` · expires ${new Date(issued.expiresAt).toLocaleString()}` : " · no expiry"}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => copy(issued.key, "key")}
                className="flex-1 rounded-md border border-white/12 py-2 text-[11.5px] text-white/65"
              >
                {copied === "key" ? "Copied ✓" : "Copy key"}
              </button>
              <button
                onClick={() => copy(inviteLink(issued.key), "link")}
                className="flex-1 rounded-md border border-brass/40 bg-brass/10 py-2 text-[11.5px] text-brass-soft"
              >
                {copied === "link" ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {/* ---------- invitations ---------- */}
        <div className="overflow-hidden rounded-xl border border-white/8">
          <div className="border-b border-white/8 bg-white/[0.03] px-5 py-3">
            <div className="label">⛓️ Invitations · {invites.length}</div>
          </div>
          <div className="divide-y divide-white/6">
            {invites.map((i) => {
              const st = inviteStatus(i);
              const holder = slaves.find((s) => s.id === i.usedBy);
              const tone =
                st === "open"
                  ? "text-amber-300"
                  : st === "used"
                    ? "text-emerald-300"
                    : st === "expired"
                      ? "text-white/35"
                      : "text-rose-300";
              return (
                <div key={i.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span
                    className={`font-mono text-[13px] tracking-[0.16em] ${
                      st === "open" ? "text-brass-soft" : "text-white/35 line-through"
                    }`}
                  >
                    {i.key}
                  </span>
                  <span className="rounded-full border border-white/12 px-2 py-0.5 font-mono text-[10px] text-white/50">
                    {i.tier}
                  </span>
                  {i.boundName && <span className="text-[12px] text-white/45">for {i.boundName}</span>}
                  <span className="flex-1" />
                  <span className={`font-mono text-[10.5px] uppercase ${tone}`}>
                    {st === "used" ? `redeemed · ${holder?.name ?? "unknown"}` : st}
                  </span>
                  {st === "open" && (
                    <>
                      <button
                        onClick={() => copy(inviteLink(i.key), "link")}
                        className="rounded-md border border-white/12 px-2.5 py-1 text-[11px] text-white/55 hover:border-brass/45"
                      >
                        Link
                      </button>
                      <button
                        onClick={() => revokeInvite(i.key)}
                        className="rounded-md border border-rose-400/30 px-2.5 py-1 text-[11px] text-rose-200 hover:bg-rose-500/10"
                      >
                        Revoke
                      </button>
                    </>
                  )}
                  {st !== "open" && (
                    <button
                      onClick={() => deleteInvite(i.key)}
                      className="rounded-md border border-white/8 px-2.5 py-1 text-[11px] text-white/30 hover:border-rose-400/40 hover:text-rose-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
              );
            })}
            {invites.length === 0 && (
              <p className="px-5 py-8 text-center text-[12.5px] text-white/35">
                No invitations issued. Nobody can enter until you generate one. ⛓️
              </p>
            )}
          </div>
        </div>

        {/* ---------- legacy cleanup ---------- */}
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="label">🔍 Verify Storage</div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">
            Confirm an invitation exists in Firestore under{" "}
            <span className="font-mono text-white/55">houses/{HOUSE_ID}/invites/&#123;token&#125;</span>. The token is
            the document id, so what you see here is exactly what is stored.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={probe}
              onChange={(e) => setProbe(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              className="flex-1 rounded-md border border-white/12 bg-black/40 px-3 py-2 font-mono text-[12px] uppercase outline-none focus:border-brass/50"
            />
            <button
              onClick={async () => {
                const t = probe.trim().toUpperCase();
                if (!t) return;
                setProbeResult("⏳ Checking…");
                if (!isFirebase) {
                  const l = invites.find((i) => i.key === t);
                  setProbeResult(l ? `✅ Present locally · ${inviteStatus(l)}` : "❌ Not found locally");
                  return;
                }
                const found = await fsFetchInvite(t);
                setProbeResult(
                  found
                    ? `✅ Found in Firestore · ${found.used ? "used" : found.revoked ? "revoked" : "open"} · tier ${found.tier}`
                    : "❌ Not in Firestore. If it shows above, it exists only locally — writes are being blocked (check rules)."
                );
              }}
              className="rounded-md border border-brass/40 bg-brass/10 px-3 py-2 text-[11.5px] text-brass-soft"
            >
              Verify
            </button>
          </div>
          {probeResult && <p className="mt-2 font-mono text-[11px] text-white/60">{probeResult}</p>}
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="label">🧹 Housekeeping</div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/40">
            Permanently erase legacy <span className="font-mono">keys</span> documents and any seeded test data left in
            Firestore from earlier builds.
          </p>
          <button
            onClick={async () => {
              if (!confirm("Purge all legacy documents and test data from Firestore?\n\nThis cannot be undone.")) return;
              const n = await fsPurgeLegacy();
              alert(`🧹 Purged ${n} legacy document${n === 1 ? "" : "s"}. The house now writes only the new structure.`);
            }}
            className="mt-3 rounded-md border border-white/12 px-3 py-2 text-[11.5px] text-white/55 transition hover:border-rose-400/40 hover:text-rose-300"
          >
            Purge legacy data
          </button>
        </div>

        {/* ---------- permanent codes ---------- */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label">🗝️ Permanent Codes</span>
            <span className="flex-1" />
            {(["all", "active", "suspended", "revoked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] capitalize transition ${
                  filter === f ? "border-brass/50 bg-brass/12 text-brass-soft" : "border-white/10 text-white/40"
                }`}
              >
                {f} · {counts[f]}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {shown.map((s) => (
              <AccessRow key={s.id} s={s} />
            ))}
            {shown.length === 0 && (
              <p className="col-span-full rounded-xl border border-white/8 py-10 text-center text-[13px] text-white/35">
                No submissives in this house yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- ledger tab ---------------- */
function LedgerTab() {
  const slaves = useStore((s) => s.slaves);
  const msgs = useStore((s) => s.messages);
  const dungeon = useStore((s) => s.dungeon);

  /* only tributes she accepted are on the record; legacy tributes carry no verdict */
  const tributes = msgs.filter((m) => m.kind === "tribute" && (!m.verdict || m.verdict === "accepted"));
  const gmv = tributes.reduce((a, m) => a + (m.amount || 0), 0);
  const subs = slaves.reduce((a, s) => a + dungeon.prices[s.tier], 0);

  /* Every figure here belongs to her. The platform takes nothing from it. */
  const stats = [
    { k: "Tribute received", v: money(gmv) },
    { k: "Collar subscriptions / mo", v: money(subs) },
    { k: "Yours to keep", v: money(gmv + subs), gold: true },
  ];

  return (
    <div className="space-y-5 p-5">
      <div className="grid gap-px overflow-hidden rounded-xl border border-brass/18 bg-brass/12 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.k} className="bg-[#0c0810] p-4">
            <div className="label">{s.k}</div>
            <div className={`font-display mt-1.5 text-[1.6rem] ${s.gold ? "gold-text" : "text-white"}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.05] px-4 py-3">
        <span className="text-[16px]">🖤</span>
        <p className="text-[12.5px] leading-relaxed text-white/60">
          <span className="text-emerald-200">No commission is deducted.</span> Tribute moves directly from him to
          you. The platform is paid by your monthly subscription alone.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-3">
          <div className="label">Lifetime by submissive</div>
        </div>
        <div className="divide-y divide-white/6">
          {[...slaves]
            .sort((a, b) => b.ltv - a.ltv)
            .map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="w-40 truncate font-mono text-[12.5px] text-white/80">{s.name}</span>
                <span className="label w-24">{s.tier}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brass to-brass/30"
                    style={{ width: `${Math.min(100, (s.ltv / Math.max(1, Math.max(...slaves.map((x) => x.ltv)))) * 100)}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono text-[12.5px] text-brass-soft">{money(s.ltv)}</span>
                <span className="w-24 text-right font-mono text-[11px] text-white/40">
                  cap {money(s.spendCap)}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="border-b border-white/8 bg-white/[0.03] px-5 py-3">
          <div className="label">Recent tributes</div>
        </div>
        <div className="thin-scroll max-h-64 divide-y divide-white/6 overflow-y-auto">
          {tributes.length === 0 && <p className="px-5 py-6 text-[13px] text-white/35">No tributes yet.</p>}
          {[...tributes].reverse().map((m) => {
            const s = slaves.find((x) => x.id === m.slaveId);
            return (
              <div key={m.id} className="flex items-center justify-between px-5 py-3">
                <span className="font-mono text-[12.5px] text-white/70">{s?.name ?? "—"}</span>
                <span className="font-mono text-[11px] text-white/35">{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-display text-[1.1rem] text-brass-soft">{money(m.amount || 0)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- house tab ---------------- */
function HouseTab() {
  const d = useStore((s) => s.dungeon);
  const [form, setForm] = useState(d);
  const [saved, setSaved] = useState(false);
  const [botDraft, setBotDraft] = useState(d.telegramBot || "");
  const [botSaved, setBotSaved] = useState(false);

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="card rounded-xl p-6">
        <h3 className="font-display text-[1.5rem] text-white">House identity</h3>

        <div className="mt-5 space-y-5">
          <ImagePicker
            label="👑 Your portrait"
            value={d.avatarUrl || ""}
            onChange={(url) => setHouseAvatars({ avatarUrl: url })}
            hint="Shown beside every decree you issue."
            size={64}
          />
          <ImagePicker
            label="⛓️ Default portrait for submissives"
            value={d.slaveAvatarUrl || ""}
            onChange={(url) => setHouseAvatars({ slaveAvatarUrl: url })}
            hint="Applied to anyone without a portrait of his own."
            size={64}
          />
          <div>
            <BgPicker
              label="🎨 House chat backdrop"
              value={d.chatBg || DEFAULT_BG}
              onChange={(bg) => setHouseChatBg(bg)}
            />
            <p className="mt-2 text-[10.5px] text-white/30">
              Applies to every conversation. Override it per submissive under his profile → Look.
            </p>
          </div>
        </div>

        <div className="my-5 h-px bg-white/8" />

        {/* telegram bot — the handle her submissives will message */}
        <div className="label">🔔 Telegram bot handle</div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={botDraft}
            onChange={(e) => setBotDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setTelegramBot(botDraft);
                setBotSaved(true);
                setTimeout(() => setBotSaved(false), 1600);
              }
            }}
            placeholder="@your_bot"
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[13.5px] outline-none focus:border-brass/50"
          />
          <button
            onClick={() => {
              setTelegramBot(botDraft);
              setBotSaved(true);
              setTimeout(() => setBotSaved(false), 1600);
            }}
            className="shrink-0 rounded-lg border border-brass/45 bg-brass/12 px-3.5 text-[12px] text-brass-soft"
          >
            {botSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/30">
          {resolveBotUsername(d.telegramBot) ? (
            <>
              In use:{" "}
              <a
                href={botUrl(resolveBotUsername(d.telegramBot))}
                target="_blank"
                rel="noreferrer"
                className="text-brass-soft/80 underline underline-offset-2"
              >
                t.me/{resolveBotUsername(d.telegramBot)} ↗
              </a>{" "}
              — saved here, so no rebuild is needed.
            </>
          ) : (
            <>Not set. Create one free with @BotFather, then paste the handle here.</>
          )}
        </p>

        <div className="my-5 h-px bg-white/8" />

        <div className="label">Name</div>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-2 w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[14px] outline-none focus:border-brass/50"
        />
        <div className="label mt-4">Honorific</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Mistress", "Goddess", "Ma'am", "Maîtresse"].map((h) => (
            <button
              key={h}
              onClick={() => setForm({ ...form, honorific: h })}
              className={`rounded-full border px-3 py-1.5 text-[12px] ${
                form.honorific === h ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/12 text-white/50"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
        <div className="label mt-4">Entry rite</div>
        <textarea
          rows={3}
          value={form.entryRite}
          onChange={(e) => setForm({ ...form, entryRite: e.target.value })}
          className="mt-2 w-full resize-none rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-[13.5px] outline-none focus:border-brass/50"
        />
        <button
          onClick={() => {
            saveDungeon(form);
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
          }}
          className="mt-4 w-full rounded-lg border border-brass/50 bg-brass/15 py-3 text-[13px] text-brass-soft"
        >
          {saved ? "Saved ✓" : "Save house"}
        </button>
      </div>

      <div className="card rounded-xl p-6">
        <h3 className="font-display text-[1.5rem] text-white">Collar pricing</h3>
        <p className="mt-1.5 text-[12.5px] text-white/50">Monthly tribute per tier.</p>
        <div className="mt-5 space-y-3">
          {(["Kneeling", "Collared", "Owned"] as Tier[]).map((t) => (
            <div key={t} className="flex items-center gap-3">
              <span className="w-24 text-[13.5px] text-white/70">{t}</span>
              <input
                type="range"
                min={20}
                max={1200}
                step={10}
                value={form.prices[t]}
                onChange={(e) => setForm({ ...form, prices: { ...form.prices, [t]: Number(e.target.value) } })}
                className="flex-1"
              />
              <span className="w-16 text-right font-mono text-[13px] text-brass-soft">${form.prices[t]}</span>
            </div>
          ))}
        </div>

        <h3 className="font-display mt-8 text-[1.5rem] text-white">House rules</h3>
        <div className="mt-3 space-y-2">
          {form.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r}
                onChange={(e) => {
                  const rules = [...form.rules];
                  rules[i] = e.target.value;
                  setForm({ ...form, rules });
                }}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] outline-none focus:border-brass/50"
              />
              <button
                onClick={() => setForm({ ...form, rules: form.rules.filter((_, j) => j !== i) })}
                className="px-2 text-white/35 hover:text-rose-300"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setForm({ ...form, rules: [...form.rules, "New rule"] })}
            className="w-full rounded-lg border border-dashed border-white/15 py-2 text-[12.5px] text-white/45 hover:border-brass/40 hover:text-brass-soft"
          >
            + add rule
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main deck ---------------- */
export default function Deck({ go }: { go: (r: string) => void }) {
  useTick();
  const slaves = useStore((s) => s.slaves);
  const dungeon = useStore((s) => s.dungeon);
  const events = useStore((s) => s.events);

  const [tab, setTab] = useState<"roster" | "invites" | "master" | "ledger" | "house">("roster");
  const [sel, setSel] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<null | { cmd: CommandId; kind: "amount" | "text" | "duration" }>(null);
  const [pv, setPv] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "gold" | "red" } | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [strikeOpen, setStrikeOpen] = useState(false);
  const [wheelId, setWheelId] = useState<string | null>(null);

  const open = slaves.find((s) => s.id === openId) ?? null;

  const sorted = useMemo(() => [...slaves].sort((a, b) => attentionDebt(b) - attentionDebt(a)), [slaves]);

  const allMessages = useStore((s) => s.messages);

  const queue = useMemo(() => {
    const q: { text: string; tone: string; meta: string; id?: string }[] = [];
    /* proofs first — they are a direct request for her judgement */
    allMessages
      .filter((m) => m.kind === "proof" && m.verdict === "pending")
      .forEach((m) => {
        const s = slaves.find((x) => x.id === m.slaveId);
        if (s) q.push({ text: `📸 Proof Awaiting Judgement: ${s.name}`, tone: "gold", meta: "Open to accept or reject", id: s.id });
      });
    allMessages
      .filter((m) => m.kind === "tribute" && m.verdict === "pending")
      .forEach((m) => {
        const s = slaves.find((x) => x.id === m.slaveId);
        if (s)
          q.push({
            text: `💰 Tribute Awaiting Acceptance: ${s.name}`,
            tone: "gold",
            meta: `${money(m.amount || 0)} offered · open his profile to accept or reject`,
            id: s.id,
          });
      });
    allMessages
      .filter((m) => m.kind === "locreq" && m.locState === "pending")
      .forEach((m) => {
        const s = slaves.find((x) => x.id === m.slaveId);
        if (s)
          q.push({
            text: `📍 Check-In Outstanding: ${s.name}`,
            tone: "gold",
            meta: `${timeLeft((m.deadline || 0) - Date.now())} remaining`,
            id: s.id,
          });
      });
    slaves.forEach((s) => {
      const d = attentionDebt(s);
      if (s.penance) q.push({ text: `⛓️ Penance Outstanding: ${s.name}`, tone: "muted", meta: s.penance.slice(0, 44), id: s.id });
      if (s.strikes >= 4)
        q.push({ text: `💥 Repeat Offender: ${s.name}`, tone: "red", meta: `${s.strikes} strikes on record`, id: s.id });
      if (d > 70) q.push({ text: `🕯️ Neglected: ${s.name}`, tone: "red", meta: `Attention debt ${d}%`, id: s.id });
      if (s.devotion < 20)
        q.push({ text: `🖤 Devotion Collapsing: ${s.name}`, tone: "red", meta: `♥ ${s.devotion} — intervene`, id: s.id });
      if (s.ltv > 5000) q.push({ text: `👑 High Value: ${s.name}`, tone: "gold", meta: `Ledger ${money(s.ltv)}`, id: s.id });
      if ((s.locMisses || 0) >= 2)
        q.push({ text: `📍 Evasive: ${s.name}`, tone: "red", meta: `${s.locMisses} check-ins missed`, id: s.id });
    });
    return q.slice(0, 8);
  }, [slaves, allMessages]);

  const targetNames =
    (sel.length ? slaves.filter((s) => sel.includes(s.id)) : open ? [open] : []).map((s) => s.name).join(", ") || "—";

  const flash = (text: string, tone: "gold" | "red" = "gold") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3200);
  };

  const run = (cmd: CommandId, arg?: string | number) => {
    const targets = sel.length ? sel : openId ? [openId] : [];
    if (!targets.length) {
      flash("Select a submissive first.", "red");
      return;
    }
    const def = COMMANDS.find((c) => c.id === cmd)!;
    const r = fireCommand(cmd, targets, arg);
    const parts: string[] = [];
    if (r.ok) parts.push(`${def.icon} ${def.label} issued to ${r.ok} ${r.ok === 1 ? "submissive" : "submissives"}`);
    if (r.refused.length)
      parts.push(`⛔ Refused for ${r.refused.map((x) => `${x.name} — ${x.why}`).join("; ")}`);

    /* A timed order that never reached his phone is worth knowing about
       before the deadline penalises him for silence. */
    if (r.undelivered.length) {
      const names = r.undelivered.map((x) => x.name).join(", ");
      const why = r.undelivered[0].why;
      parts.push(
        why === "plan"
          ? `🔒 Not pushed (${names}) — Telegram needs the ${planRequiredFor("telegram").name} plan`
          : `🔕 Not pushed (${names}) — no Telegram linked, he sees it only in the app`
      );
    }

    flash(parts.join(" · "), r.refused.length || r.undelivered.length ? "red" : "gold");
    setSel([]);
  };

  const onCommand = (cmd: CommandId) => {
    const def = COMMANDS.find((c) => c.id === cmd)!;
    if (!sel.length && !openId) {
      flash("Select a submissive first.", "red");
      return;
    }
    if (cmd === "strike") {
      setStrikeOpen(true);
      return;
    }
    if (def.needsInput) {
      setPrompt({ cmd, kind: def.needsInput });
      setPv(
        def.needsInput === "amount"
          ? "150"
          : def.needsInput === "duration"
            ? cmd === "gag"
              ? "30"
              : cmd === "locate"
                ? "15"
                : "240"
            : ""
      );
    } else run(cmd);
  };

  const TABS = [
    ["roster", "Roster"],
    ["invites", "Invitations"],
    ["master", "💳 Plan"],
    ["ledger", "Ledger"],
    ["house", "House"],
  ] as const;

  return (
    <div className="page-canvas relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-5 md:px-6">
        {/* header */}
        <header className="mb-5 flex flex-wrap items-center gap-3">
          <AvatarPlate name={dungeon.name} honorific={dungeon.honorific} src={dungeon.avatarUrl} />
          <span className="hidden h-8 w-px bg-white/10 sm:block" />
          <div className="hidden sm:block">
            <div className="label">⛓️ Command Deck</div>
            <h1 className="font-display text-[1.3rem] leading-none text-white/80">
              {dungeon.sigil} {slaves.length} in service
            </h1>
          </div>
          <span className="flex-1" />
          <ConnBadge />
          <div className="hidden items-center gap-1 rounded-full border border-white/10 p-1 sm:flex">
            {TABS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${
                  tab === k ? "bg-brass/18 text-brass-soft" : "text-white/45 hover:text-white/75"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setSession({ role: null, slaveId: null });
              go("#/gate");
            }}
            className="rounded-full border border-white/12 px-3.5 py-2 text-[12px] text-white/55 hover:text-white"
          >
            Exit
          </button>
        </header>

        <div className="mb-4 flex gap-1 rounded-full border border-white/10 p-1 sm:hidden">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-2 py-1.5 text-[12px] ${tab === k ? "bg-brass/18 text-brass-soft" : "text-white/45"}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-brass/15 bg-[#0a070b]/80">
          {tab === "roster" && (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* roster + thread */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
                  <span className="label">⛓️ The Roster · {slaves.length}</span>
                  <span className="flex-1" />
                  <span className="hidden font-mono text-[9.5px] text-white/30 sm:block">Sorted by attention debt</span>
                  <button
                    onClick={() => setTab("invites")}
                    className="rounded-full border border-brass/45 bg-brass/12 px-3 py-1.5 text-[11.5px] text-brass-soft transition hover:bg-brass/20"
                  >
                    ⛓️ Generate Invite
                  </button>
                </div>

                <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sorted.map((s) => (
                    <div key={s.id} className="relative">
                      <SlaveCard
                        s={s}
                        avatar={avatarFor(s, dungeon)}
                        on={sel.includes(s.id)}
                        onClick={() => setSel((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))}
                      />
                      <div className="absolute right-2 bottom-2 flex gap-1">
                        <button
                          onClick={() => setDrawerId(s.id)}
                          className="rounded-md border border-brass/35 bg-[#0c0810] px-2 py-0.5 text-[10px] text-brass-soft/80 hover:border-brass/70"
                        >
                          profile
                        </button>
                        <button
                          onClick={() => setOpenId(s.id)}
                          className="rounded-md border border-white/12 bg-[#0c0810] px-2 py-0.5 text-[10px] text-white/50 hover:border-brass/50 hover:text-brass-soft"
                        >
                          chat
                        </button>
                      </div>
                    </div>
                  ))}
                  {slaves.length === 0 && (
                    <div className="col-span-full py-12 text-center">
                      <p className="text-[13.5px] text-white/35">
                        This house is empty. No one enters except by invitation.
                      </p>
                      <button
                        onClick={() => setTab("invites")}
                        className="mt-3 rounded-full border border-brass/45 bg-brass/12 px-5 py-2.5 text-[12.5px] text-brass-soft"
                      >
                        ⛓️ Generate Your First Invitation
                      </button>
                    </div>
                  )}
                </div>

                {open && (
                  <div className="border-t border-white/8">
                    <div className="flex items-center gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-2.5">
                      <span className="font-mono text-[13px] text-white/85">{open.name}</span>
                      <span className="label">{rankOf(open.devotion)}</span>
                      {isGagged(open) && <span className="font-mono text-[10.5px] text-amber-300">◌ gagged {timeLeft(open.gagUntil - Date.now())}</span>}
                      {isLocked(open) && <span className="font-mono text-[10.5px] text-violet-300">⌾ locked {timeLeft(open.lockUntil - Date.now())}</span>}
                      <span className="flex-1" />
                      <button
                        onClick={() => {
                          if (
                            !confirm(
                              `Clear the entire chat history with ${open.name}?\n\nEvery message, proof and reward in this conversation is permanently erased, including its stored files. His profile, devotion, strikes and ledger totals are kept.`
                            )
                          )
                            return;
                          clearChat(open.id);
                          flash(`🧹 Chat history cleared: ${open.name}`);
                        }}
                        title="Clear chat history"
                        className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-rose-400/50 hover:text-rose-200"
                      >
                        🧹 Clear history
                      </button>
                      <button onClick={() => setOpenId(null)} className="text-white/35 hover:text-white">
                        ×
                      </button>
                    </div>
                    <div className="h-[340px]">
                      <Thread slave={open} />
                    </div>
                  </div>
                )}
              </div>

              {/* triage */}
              <aside className="border-t border-white/7 p-4 lg:border-t-0 lg:border-l">
                <div className="label">⚖️ Triage Queue</div>
                <p className="mt-1.5 text-[11px] text-white/35">Ranked by risk, never chronologically.</p>
                <div className="mt-3 space-y-2">
                  {queue.length === 0 && <p className="text-[12px] text-white/30">The house is in order. 🖤</p>}
                  {queue.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => q.id && setDrawerId(q.id)}
                      className={`w-full rounded-lg border-l-2 bg-white/[0.025] py-2.5 pr-2.5 pl-3 text-left transition hover:bg-white/[0.06] ${
                        q.tone === "red" ? "border-rose-400/70" : q.tone === "gold" ? "border-brass" : "border-white/20"
                      }`}
                    >
                      <div className="text-[11.5px] leading-snug text-white/78">{q.text}</div>
                      <div className="mt-1 font-mono text-[9.5px] text-white/35">{q.meta}</div>
                    </button>
                  ))}
                </div>

                <div className="label mt-6">📍 Last Known Positions</div>
                <div className="mt-2 space-y-1.5">
                  {slaves.filter((s) => s.lastFix).length === 0 && (
                    <p className="text-[12px] text-white/30">No location has been confirmed yet.</p>
                  )}
                  {slaves
                    .filter((s) => s.lastFix)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setOpenId(s.id)}
                        className="w-full rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] px-3 py-2 text-left transition hover:bg-emerald-500/10"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[11.5px] text-white/80">{s.name}</span>
                          <span className="flex-1" />
                          <span className="font-mono text-[9.5px] text-white/35">±{Math.round(s.lastFix!.acc)}m</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-emerald-200/70">
                          {s.lastFix!.place || `${s.lastFix!.lat.toFixed(4)}, ${s.lastFix!.lng.toFixed(4)}`}
                        </div>
                      </button>
                    ))}
                </div>

                <div className="label mt-6">📜 Activity Log</div>
                <div className="thin-scroll mt-2 max-h-52 space-y-1.5 overflow-y-auto">
                  {events.length === 0 && <p className="text-[12px] text-white/30">No activity recorded yet.</p>}
                  {events.map((e) => (
                    <div key={e.id} className="text-[11px] leading-snug text-white/50">
                      <span className={e.tone === "red" ? "text-rose-300" : e.tone === "green" ? "text-emerald-300" : "text-brass/80"}>•</span>{" "}
                      {e.text}
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {tab === "invites" && <InvitesTab />}
          {tab === "master" && <Billing />}
          {tab === "ledger" && <LedgerTab />}
          {tab === "house" && <HouseTab />}
        </div>

        {/* command bar */}
        {tab === "roster" && (
          <div className="sticky bottom-3 mt-3 rounded-xl border border-brass/25 bg-gradient-to-r from-[#170e15] to-[#0c0810] px-3 py-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,.9)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-white/45">
                {sel.length ? `${sel.length} selected` : open ? `→ ${open.name}` : "select targets"}
              </span>
              {COMMANDS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onCommand(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11.5px] transition ${
                    c.tone === "reward"
                      ? "border-emerald-400/35 bg-emerald-500/8 text-emerald-200 hover:bg-emerald-500/16"
                      : c.tone === "punish"
                        ? "border-rose-400/35 bg-rose-500/8 text-rose-200 hover:bg-rose-500/16"
                        : "border-brass/40 bg-brass/10 text-brass-soft hover:bg-brass/18"
                  }`}
                >
                  <span className="mr-1.5 opacity-70">{c.icon}</span>
                  {c.label}
                </button>
              ))}
              {sel.length > 0 && (
                <button onClick={() => setSel([])} className="text-[11px] text-white/35 hover:text-white">
                  clear
                </button>
              )}
              <button
                onClick={() => {
                  if (!has("wheel")) {
                    flash(`🔒 The Wheel requires the ${planRequiredFor("wheel").name} plan.`, "red");
                    return;
                  }
                  const t = sel.length ? sel[0] : openId;
                  if (!t) {
                    flash("Select one submissive to sentence.", "red");
                    return;
                  }
                  setWheelId(t);
                }}
                className="rounded-full border border-brass/45 bg-gradient-to-r from-brass/22 to-brass/8 px-3 py-1.5 text-[11.5px] font-medium text-brass-soft transition hover:from-brass/35"
              >
                <span className="mr-1.5">🎡</span>Wheel
              </button>
              <button
                onClick={() => {
                  if (!has("media")) {
                    flash(`🔒 Media rewards require the ${planRequiredFor("media").name} plan.`, "red");
                    return;
                  }
                  if (!sel.length && !openId) {
                    flash("Select a recipient first.", "red");
                    return;
                  }
                  setMediaOpen(true);
                }}
                className="rounded-full border border-brass/45 bg-gradient-to-r from-brass/22 to-brass/8 px-3 py-1.5 text-[11.5px] font-medium text-brass-soft transition hover:from-brass/35"
              >
                <span className="mr-1.5">👠</span>Send media
              </button>
              <button
                onClick={() => {
                  if (
                    !confirm(
                      "🕊️ Freeze the entire house?\n\nEvery gag, chastity lock, penance and check-in will be cleared immediately, and tribute will be suspended for one hour.\n\nThis applies to all submissives at once."
                    )
                  )
                    return;
                  freezeHouse();
                  setSel([]);
                  flash("🕊️ House Frozen — every condition cleared", "red");
                }}
                className="ml-auto rounded-full border border-rose-400/45 bg-rose-500/12 px-3.5 py-1.5 text-[11.5px] font-medium text-rose-200 transition hover:bg-rose-500/22"
              >
                🕊️ Safeword · Freeze All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* prompt */}
      {prompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 px-4 py-4 backdrop-blur-sm sm:items-center"
          onClick={() => setPrompt(null)}
        >
          <div
            className="thin-scroll max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-brass/30 bg-gradient-to-b from-[#1a1016] to-[#0b0709] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,.95)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[20px]">
                {COMMANDS.find((c) => c.id === prompt.cmd)!.icon}
              </span>
              <div>
                <div className="label">Issue command</div>
                <div className="font-display text-[1.5rem] leading-none text-white">
                  {COMMANDS.find((c) => c.id === prompt.cmd)!.label}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] text-white/55">
              To: <span className="text-brass-soft">{targetNames}</span>
            </div>

            {prompt.kind === "amount" && (
              <>
                <div className="label mt-5">Amount 💰</div>
                <input
                  autoFocus
                  type="number"
                  value={pv}
                  onChange={(e) => setPv(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-4 py-3 text-center font-mono text-[1.6rem] text-brass-soft outline-none focus:border-brass/60"
                />
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[50, 150, 500, 1500].map((a) => (
                    <button
                      key={a}
                      onClick={() => setPv(String(a))}
                      className={`rounded-md border py-2 text-[12px] transition ${
                        Number(pv) === a ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/12 text-white/55"
                      }`}
                    >
                      ${a}
                    </button>
                  ))}
                </div>
              </>
            )}

            {prompt.kind === "duration" && (
              <>
                <div className="label mt-5">Duration ⏳</div>
                <div className="mt-2 rounded-lg border border-brass/25 bg-brass/8 py-4 text-center">
                  <div className="font-display text-[2.1rem] leading-none gold-text">{fmtMins(Number(pv) || 0)}</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(prompt.cmd === "locate" ? CHECKIN_WINDOWS : DURATIONS).map((d) => (
                    <button
                      key={d.m}
                      onClick={() => setPv(String(d.m))}
                      className={`rounded-md border py-2 text-[12px] transition ${
                        Number(pv) === d.m ? "border-brass/60 bg-brass/15 text-brass-soft" : "border-white/12 text-white/55"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {prompt.cmd === "locate" && (
                  <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/6 px-3 py-2 text-[11.5px] leading-relaxed text-rose-100/75">
                    ⛓️ If he does not pin his location within the window: strike +1, devotion −6 and a penance is
                    assigned automatically.
                  </p>
                )}
                <div className="label mt-4">Fine tune</div>
                <input
                  type="range"
                  min={5}
                  max={1440}
                  step={5}
                  value={Number(pv) || 5}
                  onChange={(e) => setPv(e.target.value)}
                  className="mt-3 w-full"
                />
              </>
            )}

            {prompt.kind === "text" && (
              <>
                <div className="label mt-5">{prompt.cmd === "penance" ? "The penance ⛓️" : "Your decree 📜"}</div>
                <textarea
                  autoFocus
                  rows={3}
                  value={pv}
                  onChange={(e) => setPv(e.target.value)}
                  placeholder={prompt.cmd === "penance" ? "Write 200 lines of gratitude..." : "Kneel and do not move..."}
                  className="mt-2 w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-3 text-[14px] leading-relaxed outline-none focus:border-brass/60"
                />
                <div className="label mt-3">Quick fill</div>
                <div className="mt-2 space-y-1.5">
                  {(prompt.cmd === "penance" ? PENANCE_PRESETS : DECREE_PRESETS).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPv(p)}
                      className="w-full rounded-md border border-white/8 bg-white/[0.025] px-3 py-2 text-left text-[12.5px] text-white/60 transition hover:border-brass/40 hover:text-brass-soft"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {prompt.cmd === "penance" && (
                  <p className="mt-3 rounded-lg border border-brass/20 bg-brass/6 px-3 py-2 text-[11.5px] text-brass-soft/75">
                    📸 He will be required to upload proof of compliance.
                  </p>
                )}
              </>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={() => setPrompt(null)} className="flex-1 rounded-lg border border-white/12 py-3 text-[13px] text-white/60">
                Cancel
              </button>
              <button
                onClick={() => {
                  run(prompt.cmd, prompt.kind === "text" ? pv : Number(pv));
                  setPrompt(null);
                }}
                className="flex-1 rounded-lg border border-brass/50 bg-gradient-to-r from-brass/25 to-brass/10 py-3 text-[13px] font-medium text-brass-soft"
              >
                Issue ⛓️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* profile drawer */}
      {drawerId && slaves.find((s) => s.id === drawerId) && (
        <SlaveDrawer
          slave={slaves.find((s) => s.id === drawerId)!}
          onClose={() => setDrawerId(null)}
          onOpenChat={() => {
            setOpenId(drawerId);
            setDrawerId(null);
          }}
          flash={flash}
        />
      )}

      {/* strike with implement */}
      {strikeOpen && (
        <StrikeModal
          targets={sel.length ? sel : openId ? [openId] : []}
          targetNames={targetNames}
          onClose={() => setStrikeOpen(false)}
          onDone={(m) => {
            flash(m, "red");
            setSel([]);
          }}
        />
      )}

      {/* punishment wheel */}
      {wheelId && slaves.find((s) => s.id === wheelId) && (
        <PunishmentWheel
          slave={slaves.find((s) => s.id === wheelId)!}
          onClose={() => setWheelId(null)}
          onResult={(m) => flash(m, "red")}
        />
      )}

      {/* media composer */}
      {mediaOpen && (
        <MediaComposer
          targets={sel.length ? sel : openId ? [openId] : []}
          targetNames={targetNames}
          onClose={() => setMediaOpen(false)}
          onSent={(msg) => {
            flash(msg, "gold");
            setSel([]);
          }}
        />
      )}

      {/* toast */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border px-5 py-2.5 text-[12.5px] backdrop-blur-xl ${
            toast.tone === "red" ? "border-rose-400/40 bg-rose-950/80 text-rose-100" : "border-brass/40 bg-[#140d12]/90 text-brass-soft"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
