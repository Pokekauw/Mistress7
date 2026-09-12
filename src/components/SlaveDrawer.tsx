import { useEffect, useMemo, useState } from "react";
import {
  ACCESS_LOOK,
  attentionDebt,
  attentionDeadline,
  avatarFor,
  bgStyle,
  chatBgFor,
  clearChat,
  DEFAULT_ATTENTION_HOURS,
  fireCommand,
  has,
  setAccess,
  unlinkTelegram,
  setAttentionHours,
  setSlaveAvatar,
  setSlaveChatBg,
  judgeProof,
  judgeTribute,
  money,
  rankOf,
  removeSlave,
  restartAttention,
  timeLeft,
  useStore,
  useTick,
  type Slave,
} from "../lib/store";
import ConditionTimer from "./ConditionTimer";
import StrikeModal from "./StrikeModal";
import PunishmentWheel from "./PunishmentWheel";
import LocationCard from "./LocationCard";
import DevotionControl from "./DevotionControl";
import ImagePicker from "./ImagePicker";
import BgPicker from "./BgPicker";
import Avatar, { SlaveAvatar } from "./Avatar";
import CommandLog from "./CommandLog";
import { planRequiredFor } from "../lib/plans";

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function SlaveDrawer({
  slave,
  onClose,
  onOpenChat,
  flash,
}: {
  slave: Slave;
  onClose: () => void;
  onOpenChat: () => void;
  flash: (m: string, tone?: "gold" | "red") => void;
}) {
  useTick();
  const msgs = useStore((s) => s.messages);
  const dungeon = useStore((s) => s.dungeon);
  const [strike, setStrike] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [tab, setTab] = useState<"control" | "look" | "proof" | "history">("control");
  const [pulse, setPulse] = useState<string | null>(null);

  const proofs = useMemo(
    () => msgs.filter((m) => m.slaveId === slave.id && m.kind === "proof").sort((a, b) => b.time - a.time),
    [msgs, slave.id]
  );
  const pendingProofs = proofs.filter((p) => p.verdict === "pending");
  /* tributes waiting on her accept / reject */
  const tributeOffers = useMemo(
    () =>
      msgs
        .filter((m) => m.slaveId === slave.id && m.kind === "tribute" && m.verdict === "pending")
        .sort((a, b) => b.time - a.time),
    [msgs, slave.id]
  );
  const debt = attentionDebt(slave);
  const hours = slave.attentionHours || DEFAULT_ATTENTION_HOURS;
  const debtLeft = attentionDeadline(slave) - Date.now();

  /* local draft for the attention-window slider — commits on release */
  const [draftHours, setDraftHours] = useState(hours);
  useEffect(() => setDraftHours(hours), [hours]);

  const beat = (m: string, tone: "gold" | "red" = "gold") => {
    flash(m, tone);
    setPulse(m);
    window.setTimeout(() => setPulse(null), 1600);
  };

  const quick = (cmd: Parameters<typeof fireCommand>[0], arg?: string | number, msg?: string) => {
    const r = fireCommand(cmd, [slave.id], arg);
    if (r.refused.length) beat(`⛔ Refused — ${r.refused[0].why}`, "red");
    else beat(msg || "⛓️ Issued");
  };

  const STATS = [
    { l: "Devotion", v: `♥ ${slave.devotion}`, c: "text-brass-soft" },
    { l: "Strikes", v: `💥 ${slave.strikes}`, c: slave.strikes > 2 ? "text-rose-300" : "text-white/80" },
    { l: "Ledger", v: money(slave.ltv), c: "text-white/80" },
    { l: "Missed 📍", v: String(slave.locMisses || 0), c: (slave.locMisses || 0) > 0 ? "text-rose-300" : "text-white/80" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <aside className="fixed inset-y-0 right-0 z-[65] flex w-full max-w-md flex-col border-l border-brass/25 bg-gradient-to-b from-[#170e15] to-[#0a070b] shadow-[-30px_0_80px_-20px_rgba(0,0,0,.95)]">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-white/8 p-4">
          <SlaveAvatar size={48} src={avatarFor(slave, dungeon)} name={slave.name} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[14px] text-white">{slave.name}</div>
            <div className="label mt-0.5">
              {slave.tier} · {rankOf(slave.devotion)}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full transition-all ${debt > 70 ? "bg-rose-400/80" : debt > 40 ? "bg-amber-400/70" : "bg-brass/70"}`}
                style={{ width: `${debt}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[9.5px] text-white/35">
              Attention debt {debt}% · {hours}h window · due {timeLeft(Math.max(0, debtLeft)) || "now"}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-[20px] leading-none text-white/40 hover:text-white">
            ×
          </button>
        </div>

        {/* stats */}
        <div className="grid grid-cols-4 gap-px border-b border-white/8 bg-white/8">
          {STATS.map((s) => (
            <div key={s.l} className="bg-[#0e0912] px-2 py-2.5 text-center">
              <div className="label !text-[8.5px]">{s.l}</div>
              <div className={`font-display mt-0.5 text-[1.05rem] ${s.c}`}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="flex gap-1 border-b border-white/8 p-2">
          {([
            ["control", "Control"],
            ["look", "Look"],
            ["proof", `Proof${pendingProofs.length ? ` (${pendingProofs.length})` : ""}`],
            ["history", "History"],
          ] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg px-2 py-2 text-[12px] transition ${
                tab === k ? "bg-brass/15 text-brass-soft" : "text-white/45 hover:text-white/75"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {tab === "control" && (
            <div className="space-y-3">
              {/* tributes awaiting her verdict */}
              {tributeOffers.map((o) => (
                <div key={o.id} className="rounded-xl border border-amber-400/45 bg-amber-500/[0.07] p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="label !text-amber-200/85">💰 Tribute offered</span>
                    <span className="flex-1" />
                    <span className="font-display text-[1.3rem] text-amber-200">{money(o.amount || 0)}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
                    Nothing is recorded until you accept. Releasing it declines and discards the offer.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => {
                        const r = judgeTribute(o.id, false);
                        if (r.ok) beat("⛔ Tribute declined", "red");
                        else if (r.error) beat(r.error, "red");
                      }}
                      className="flex-1 rounded-md border border-rose-400/40 bg-rose-500/10 py-2 text-[11.5px] text-rose-200 transition hover:bg-rose-500/20"
                    >
                      ❌ Reject
                    </button>
                    <button
                      onClick={() => {
                        const r = judgeTribute(o.id, true);
                        if (r.ok) beat(`💰 Tribute accepted: ${money(o.amount || 0)} · on record`);
                        else if (r.error) beat(r.error, "red");
                      }}
                      className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 py-2 text-[11.5px] text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      ✅ Accept
                    </button>
                  </div>
                </div>
              ))}

              {/* permanent key */}
              <div
                className={`rounded-xl border p-3.5 ${
                  slave.access === "active"
                    ? "border-emerald-400/25 bg-emerald-500/[0.05]"
                    : slave.access === "suspended"
                      ? "border-amber-400/30 bg-amber-500/[0.06]"
                      : "border-rose-400/30 bg-rose-500/[0.06]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="label">🗝️ Permanent code</span>
                  <span className="flex-1" />
                  <span className="font-mono text-[9.5px] text-white/45 uppercase">
                    {ACCESS_LOOK[slave.access].icon} {ACCESS_LOOK[slave.access].label}
                  </span>
                </div>
                <div
                  className={`mt-1.5 font-mono text-[1.3rem] tracking-[0.24em] ${
                    slave.access === "active" ? "text-brass-soft" : "text-white/30 line-through"
                  }`}
                >
                  {slave.accessCode}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {slave.access !== "active" && (
                    <button
                      onClick={() => {
                        setAccess(slave.id, "active");
                        beat(`🗝️ Access Restored: ${slave.name}`);
                      }}
                      className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200"
                    >
                      🗝️ Restore Access
                    </button>
                  )}
                  {slave.access !== "suspended" && (
                    <button
                      onClick={() => {
                        setAccess(slave.id, "suspended");
                        beat(`⏸️ Access Suspended: ${slave.name}`, "red");
                      }}
                      className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200"
                    >
                      ⏸️ Suspend Access
                    </button>
                  )}
                  {slave.access !== "revoked" && (
                    <button
                      onClick={() => {
                        if (
                          !confirm(
                            `Withdraw the key from ${slave.name}?\n\nHe will be locked out immediately. His code ${slave.accessCode} remains assigned to him and his history is preserved — you may restore access at any time.`
                          )
                        )
                          return;
                        setAccess(slave.id, "revoked");
                        beat(`⛔ Key Withdrawn: ${slave.name}`, "red");
                      }}
                      className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200"
                    >
                      ⛔ Withdraw Key
                    </button>
                  )}
                </div>
              </div>

              <DevotionControl slave={slave} onDone={(m) => beat(m)} />

              {/* attention debt timer — individually overridable, default 12h */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="label">⏳ Attention debt timer</span>
                  <span className="flex-1" />
                  <span className="font-mono text-[10px] text-white/45">
                    {hours}h · due {timeLeft(Math.max(0, debtLeft)) || "now"}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/45">
                  If he is completely silent — no chat, ritual, tribute, proof or check-in — for the whole window,{" "}
                  <span className="text-rose-200/80">10 devotion is removed automatically</span> and the timer starts
                  over. Looking at the app does not count.
                </p>

                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {[6, 12, 24, 48].map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setAttentionHours(slave.id, h);
                        setDraftHours(h);
                        beat(`⏳ Attention timer set to ${h}h · ${slave.name}`);
                      }}
                      className={`rounded-md border py-2 text-[11px] transition ${
                        hours === h
                          ? "border-brass/60 bg-brass/15 text-brass-soft"
                          : "border-white/10 text-white/55 hover:border-brass/40"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={72}
                    step={1}
                    value={draftHours}
                    onChange={(e) => setDraftHours(Number(e.target.value))}
                    onPointerUp={() => {
                      if (draftHours !== hours) {
                        setAttentionHours(slave.id, draftHours);
                        beat(`⏳ Attention timer set to ${draftHours}h · ${slave.name}`);
                      }
                    }}
                    onKeyUp={() => {
                      if (draftHours !== hours) {
                        setAttentionHours(slave.id, draftHours);
                        beat(`⏳ Attention timer set to ${draftHours}h · ${slave.name}`);
                      }
                    }}
                    className="flex-1"
                  />
                  <span className="w-14 text-right font-mono text-[12px] text-brass-soft">{draftHours}h</span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  {slave.attentionHours ? (
                    <button
                      onClick={() => {
                        setAttentionHours(slave.id, null);
                        setDraftHours(DEFAULT_ATTENTION_HOURS);
                        beat(`⏳ Attention timer reset to default ${DEFAULT_ATTENTION_HOURS}h`);
                      }}
                      className="rounded-md border border-white/12 px-2.5 py-1 text-[10.5px] text-white/55 transition hover:border-brass/45 hover:text-brass-soft"
                    >
                      ↺ reset to default {DEFAULT_ATTENTION_HOURS}h
                    </button>
                  ) : (
                    <span className="font-mono text-[9.5px] text-white/30">house default · {DEFAULT_ATTENTION_HOURS}h</span>
                  )}
                  <span className="flex-1" />
                  <button
                    onClick={() => {
                      /* wind his timer back to now without changing the window — a fresh start */
                      restartAttention(slave.id);
                      beat(`⏳ Attention timer restarted · ${slave.name}`);
                    }}
                    className="rounded-md border border-white/12 px-2.5 py-1 text-[10.5px] text-white/55 transition hover:border-brass/45 hover:text-brass-soft"
                  >
                    ↻ restart now
                  </button>
                </div>
              </div>

              {/* delivery reach — does an order actually arrive on his phone? */}
              <div
                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${
                  slave.telegram
                    ? "border-emerald-400/25 bg-emerald-500/[0.05]"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <span className="text-[14px]">{slave.telegram ? "🔔" : "🔕"}</span>
                <div className="min-w-0 flex-1">
                  <div className="label">Order delivery</div>
                  <div className="mt-0.5 truncate text-[12px] text-white/70">
                    {slave.telegram ? (
                      <>
                        Telegram linked
                        {slave.telegram.username ? ` · @${slave.telegram.username}` : ""}
                      </>
                    ) : !has("telegram") ? (
                      <span className="text-white/40">Requires the {planRequiredFor("telegram").name} plan</span>
                    ) : (
                      <span className="text-white/40">Not linked — he sees orders only in the app</span>
                    )}
                  </div>
                  {slave.lastDelivery && (
                    <div
                      className={`mt-0.5 font-mono text-[9.5px] ${
                        slave.lastDelivery.ok ? "text-emerald-300/70" : "text-rose-300/80"
                      }`}
                    >
                      {slave.lastDelivery.ok ? "✓ last push delivered" : "⚠️ last push failed"} · {ago(slave.lastDelivery.at)}
                    </div>
                  )}
                </div>
                {slave.telegram && (
                  <button
                    onClick={() => {
                      unlinkTelegram(slave.id);
                      beat(`🔕 Telegram unlinked: ${slave.name}`, "red");
                    }}
                    className="shrink-0 text-[11px] text-white/35 hover:text-rose-300"
                  >
                    Unlink
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <ConditionTimer slave={slave} what="gag" />
                <ConditionTimer slave={slave} what="lock" />
              </div>

              {slave.penance && (
                <div className="rounded-lg border border-rose-400/30 bg-rose-950/25 px-3.5 py-3">
                  <div className="label !text-rose-200/70">⛓️ Penance Outstanding</div>
                  <p className="mt-1 text-[13px] text-white/85">{slave.penance}</p>
                </div>
              )}

              {slave.lastFix && <LocationCard fix={slave.lastFix} compact />}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStrike(true)}
                  className="rounded-lg border border-rose-400/40 bg-rose-500/10 py-3 text-[12.5px] text-rose-200 transition hover:bg-rose-500/20"
                >
                  💥 Strike…
                </button>
                <button
                  onClick={() => setWheel(true)}
                  className="rounded-lg border border-brass/45 bg-gradient-to-r from-brass/22 to-brass/8 py-3 text-[12.5px] text-brass-soft transition hover:from-brass/35"
                >
                  🎡 Wheel
                </button>
                <button
                  onClick={() => quick("locate", 15, `📍 Check-In Demanded: ${slave.name} · 15m`)}
                  className="rounded-lg border border-white/12 py-3 text-[12.5px] text-white/70 transition hover:border-brass/45"
                >
                  📍 Demand Check-In
                </button>
                <button
                  onClick={() => quick("tribute", 150, `💰 Tribute Demanded: ${slave.name}`)}
                  className="rounded-lg border border-white/12 py-3 text-[12.5px] text-white/70 transition hover:border-brass/45"
                >
                  💰 Demand Tribute
                </button>
                <button
                  onClick={() => quick("praise", undefined, `🖤 Approval Granted: ${slave.name}`)}
                  className="rounded-lg border border-emerald-400/35 bg-emerald-500/8 py-3 text-[12.5px] text-emerald-200"
                >
                  🖤 Grant Approval
                </button>
                <button
                  onClick={() => quick("mercy", undefined, `🕊️ Mercy Granted: ${slave.name}`)}
                  className="rounded-lg border border-emerald-400/35 bg-emerald-500/8 py-3 text-[12.5px] text-emerald-200"
                >
                  🕊️ Grant Mercy
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onOpenChat}
                  className="rounded-lg border border-white/12 py-3 text-[12.5px] text-white/70 transition hover:border-brass/45 hover:text-brass-soft"
                >
                  💬 Open Conversation
                </button>
                <button
                  onClick={() => {
                    if (
                      !confirm(
                        `Clear the entire chat history with ${slave.name}?\n\nEvery message, proof and reward in this conversation is permanently erased, including its stored files. His profile, devotion, strikes and ledger totals are kept.`
                      )
                    )
                      return;
                    clearChat(slave.id);
                    beat(`🧹 Chat history cleared: ${slave.name}`, "red");
                  }}
                  className="rounded-lg border border-white/12 py-3 text-[12.5px] text-white/70 transition hover:border-rose-400/50 hover:text-rose-200"
                >
                  🧹 Clear History
                </button>
              </div>

              <button
                onClick={() => {
                  if (
                    !confirm(
                      `Cast ${slave.name} out of this house?\n\nHis profile, ledger and entire history will be erased permanently. This cannot be undone.\n\nTo lock him out while keeping his record, withdraw his key instead.`
                    )
                  )
                    return;
                  removeSlave(slave.id);
                  flash(`⛔ Cast Out: ${slave.name}`, "red");
                  onClose();
                }}
                className="w-full rounded-lg border border-white/8 py-2.5 text-[11.5px] text-white/35 transition hover:border-rose-400/40 hover:text-rose-300"
              >
                Cast Out of House
              </button>
            </div>
          )}

          {tab === "look" && (
            <div className="space-y-5">
              <ImagePicker
                label="🖼️ His portrait"
                value={slave.avatarUrl || ""}
                onChange={(url) => {
                  setSlaveAvatar(slave.id, url);
                  beat(url ? "🖼️ Portrait updated" : "🖼️ Portrait cleared");
                }}
                hint={
                  slave.avatarUrl
                    ? "Overrides the house default for this submissive."
                    : "Currently using the house default. Set one to override it."
                }
              />

              <div className="h-px bg-white/8" />

              <div>
                <BgPicker
                  label="🎨 His chat backdrop"
                  value={chatBgFor(slave, dungeon)}
                  onChange={(bg) => {
                    setSlaveChatBg(slave.id, bg);
                    beat("🎨 Backdrop updated");
                  }}
                  onReset={
                    slave.chatBg
                      ? () => {
                          setSlaveChatBg(slave.id, null);
                          beat("🎨 Backdrop reset to house default");
                        }
                      : undefined
                  }
                  resetLabel="Use house default"
                />
                <p className="mt-2 text-[10.5px] text-white/30">
                  {slave.chatBg
                    ? "This conversation has its own backdrop."
                    : "Following the house backdrop. Pick one to override it."}
                </p>
              </div>

              <div className="h-px bg-white/8" />

              <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                <div className="label">Preview</div>
                <div className="mt-2 rounded-lg p-3" style={bgStyle(chatBgFor(slave, dungeon))}>
                  <div className="flex items-end gap-2">
                    <Avatar size={26} src={dungeon.avatarUrl} />
                    <div className="rounded-2xl rounded-bl-md border border-brass/25 bg-gradient-to-br from-brass/25 to-brass/10 px-3 py-2 text-[12px] text-brass-soft">
                      Kneel. 🖤
                    </div>
                  </div>
                  <div className="mt-2 flex items-end justify-end gap-2">
                    <div className="rounded-2xl rounded-br-md border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] text-white/80">
                      Yes, Mistress.
                    </div>
                    <SlaveAvatar size={26} src={avatarFor(slave, dungeon)} name={slave.name} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "proof" && (
            <div className="space-y-3">
              {proofs.length === 0 && (
                <p className="py-10 text-center text-[13px] text-white/35">📸 No proof has been submitted yet.</p>
              )}
              {proofs.map((p) => (
                <div
                  key={p.id}
                  className={`overflow-hidden rounded-xl border ${
                    p.verdict === "pending"
                      ? "border-violet-400/40 bg-violet-500/8"
                      : p.verdict === "accepted"
                        ? "border-emerald-400/25 bg-emerald-500/5"
                        : "border-rose-400/25 bg-rose-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="label !text-violet-200/75">📸 Proof of Compliance</span>
                    <span className="flex-1" />
                    <span className="font-mono text-[9.5px] text-white/35">{ago(p.time)}</span>
                    <span
                      className={`font-mono text-[9.5px] uppercase ${
                        p.verdict === "accepted" ? "text-emerald-300" : p.verdict === "rejected" ? "text-rose-300" : "text-amber-300"
                      }`}
                    >
                      {p.verdict === "pending" ? "Awaiting Judgement" : p.verdict}
                    </span>
                  </div>
                  {p.file?.url ? (
                    <img src={p.file.url} alt="proof" loading="lazy" className="max-h-48 w-full object-cover" />
                  ) : (
                    <div className="px-3 py-4 text-[12px] text-white/50">📎 {p.file?.name || "file"}</div>
                  )}
                  {p.text && <p className="px-3 py-2 text-[12.5px] text-white/70">{p.text}</p>}
                  {p.verdict === "pending" && (
                    <div className="flex gap-2 p-2.5">
                      <button
                        onClick={() => {
                          judgeProof(p.id, false);
                          beat(`❌ Proof Rejected: ${slave.name} · +1 strike`, "red");
                        }}
                        className="flex-1 rounded-md border border-rose-400/40 bg-rose-500/10 py-2 text-[12px] text-rose-200"
                      >
                        ❌ Reject
                      </button>
                      <button
                        onClick={() => {
                          judgeProof(p.id, true);
                          beat(`✅ Proof Accepted: ${slave.name} · +8 devotion`);
                        }}
                        className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 py-2 text-[12px] text-emerald-200"
                      >
                        ✅ Accept
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-3">
              <CommandLog messages={msgs.filter((m) => m.slaveId === slave.id)} limit={30} />

              <div className="label pt-1">⛓️ Discipline record</div>
              {(slave.log || []).length === 0 && (
                <p className="py-10 text-center text-[13px] text-white/35">No disciplinary history on record.</p>
              )}
              {(slave.log || []).map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
                  <span className="mt-0.5 text-[15px]">{e.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-white/85">{e.label}</div>
                    <div className="text-[11px] text-white/40 italic">{e.detail}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {e.devotion !== 0 && (
                      <div className={`font-mono text-[11px] ${e.devotion > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {e.devotion > 0 ? "+" : ""}
                        {e.devotion}♥
                      </div>
                    )}
                    <div className="font-mono text-[9px] text-white/25">{ago(e.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* instant feedback */}
        {pulse && (
          <div className="border-t border-brass/25 bg-brass/10 px-4 py-2.5 text-center text-[12px] text-brass-soft">{pulse}</div>
        )}
      </aside>

      {strike && (
        <StrikeModal
          targets={[slave.id]}
          targetNames={slave.name}
          onClose={() => setStrike(false)}
          onDone={(m) => beat(m, "red")}
        />
      )}
      {wheel && <PunishmentWheel slave={slave} onClose={() => setWheel(false)} onResult={(m) => beat(m, "red")} />}
    </>
  );
}
