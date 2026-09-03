import { useState } from "react";
import { ENV_BOT_USERNAME } from "../lib/telegram";
import { useTelegramLink } from "../lib/useTelegramLink";
import type { Slave } from "../lib/store";

/**
 * The pairing flow, inline in the chat window rather than buried behind
 * an icon. Compact by default so it never crowds the conversation, and
 * it removes itself once the link is made.
 */
export default function TelegramInline({ slave }: { slave: Slave }) {
  const t = useTelegramLink(slave);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  /* just linked — confirm it, then get out of the way */
  if (t.linked) {
    if (!t.justLinked) return null;
    return (
      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-emerald-400/35 bg-emerald-500/[0.08] px-4 py-2.5">
        <span className="text-[15px]">🔔</span>
        <span className="text-[12.5px] text-emerald-100">
          Telegram linked{slave.telegram?.username ? ` · @${slave.telegram.username}` : ""}. Her orders will reach
          your phone.
        </span>
      </div>
    );
  }

  /* he closed it — the header bell remains */
  if (dismissed) return null;



  /* ---------- no handle configured yet ---------- */
  if (!t.hasBot) {
    return (
      <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px]">🔕</span>
          <span className="label !text-amber-200/80">Telegram not configured</span>
          <span className="flex-1" />
          <button onClick={() => setDismissed(true)} className="text-[15px] leading-none text-white/25 hover:text-white/60">
            ×
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-100/80">
          No bot handle is set for this house. Enter it below — it saves instantly, no rebuild needed.
        </p>
        <div className="mt-2 flex gap-1.5">
          <input
            value={t.draftBot}
            onChange={(e) => {
              t.setDraftBot(e.target.value);
              t.setBotErr("");
            }}
            onKeyDown={(e) => e.key === "Enter" && t.saveBot()}
            placeholder="@your_bot"
            className="min-w-0 flex-1 rounded-md border border-white/12 bg-black/40 px-2.5 py-1.5 text-[12px] outline-none focus:border-brass/50"
          />
          <button
            onClick={() => t.saveBot()}
            className="shrink-0 rounded-md border border-brass/45 bg-brass/12 px-3 py-1.5 text-[11.5px] text-brass-soft"
          >
            Save
          </button>
        </div>
        {t.botErr && <p className="mt-1.5 text-[10.5px] text-rose-300">{t.botErr}</p>}
        {ENV_BOT_USERNAME && (
          <p className="mt-1.5 text-[10px] text-white/35">
            Build-time default: <span className="text-white/50">@{ENV_BOT_USERNAME}</span>
          </p>
        )}
      </div>
    );
  }

  /* ---------- collapsed prompt ---------- */
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group mt-2 flex w-full items-center gap-2.5 rounded-xl border border-brass/25 bg-brass/[0.06] px-4 py-2.5 text-left transition hover:border-brass/50 hover:bg-brass/[0.12]"
      >
        <span className="text-[15px]">🔔</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] text-brass-soft/90">Receive her orders on your phone</span>
          <span className="block text-[10.5px] text-white/35">Link Telegram · free · two taps</span>
        </span>
        {t.watching && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-brass/25 border-t-brass" />}
        <span className="shrink-0 text-[11px] text-brass/60 transition group-hover:translate-x-0.5">→</span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          className="shrink-0 pl-1 text-[15px] leading-none text-white/20 hover:text-white/60"
        >
          ×
        </span>
      </button>
    );
  }

  /* ---------- expanded, in-chat pairing ---------- */
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-brass/30 bg-gradient-to-b from-brass/[0.10] to-transparent">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="text-[14px]">🔔</span>
        <span className="label">Link Telegram</span>
        <span className="flex-1" />
        <button onClick={() => setOpen(false)} className="text-[11px] text-white/35 hover:text-white/70">
          Hide
        </button>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        {/* 1 — open the bot */}
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[9px] text-brass-soft">
            1
          </span>
          <a
            href={t.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => t.setWatching(true)}
            className="flex-1 rounded-lg border border-brass/50 bg-brass/15 px-3.5 py-2 text-center text-[12px] text-brass-soft transition hover:bg-brass/25"
          >
            Open @{t.bot} ↗
          </a>
        </div>

        {/* 2 — the pairing code */}
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[9px] text-brass-soft">
            2
          </span>
          <button
            onClick={t.copyCode}
            disabled={!t.code}
            title="Copy the pairing code"
            className="flex-1 rounded-lg border border-white/12 bg-black/40 px-3 py-2 text-center font-mono text-[1rem] tracking-[0.2em] text-brass-soft transition hover:border-brass/45 disabled:opacity-40"
          >
            {!t.code ? "…" : t.copied ? "Copied ✓" : t.code}
          </button>
        </div>

        {/* 3 — confirmation */}
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[9px] text-brass-soft">
            3
          </span>
          {t.watching ? (
            <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.07] px-3 py-2">
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brass/25 border-t-brass" />
              <span className="text-[11.5px] text-brass-soft/85">Waiting for the bot…</span>
              <button
                onClick={() => void t.check(true)}
                className="ml-auto shrink-0 text-[10.5px] text-white/40 hover:text-brass-soft"
              >
                check now
              </button>
            </div>
          ) : (
            <button
              onClick={() => void t.check(true)}
              disabled={t.checking || !t.code}
              className="flex-1 rounded-lg border border-brass/40 bg-brass/[0.08] px-3 py-2 text-[12px] text-brass-soft transition hover:bg-brass/20 disabled:opacity-50"
            >
              {t.checking ? "⏳ Checking…" : "I have messaged the bot"}
            </button>
          )}
        </div>

        <p className="pl-8 text-[10px] leading-relaxed text-white/25">
          Confirms itself when you return from Telegram ·{" "}
          <a href={t.botHref} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/50">
            t.me/{t.bot}
          </a>
        </p>

        {t.err && !t.diagnosis && <p className="pl-8 text-[11px] leading-snug text-rose-300">{t.err}</p>}

        {/* nothing is arriving — say why, and offer a way through */}
        {t.diagnosis && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.07] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px]">⚠️</span>
              <span className="text-[12px] font-medium text-amber-100">{t.diagnosis.title}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">{t.diagnosis.detail}</p>

            {t.diagnosis.manualPossible && (
              <div className="mt-3 border-t border-white/8 pt-2.5">
                <div className="label">Link by hand instead</div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-white/35">
                  Message{" "}
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brass-soft/70 underline underline-offset-2"
                  >
                    @userinfobot
                  </a>{" "}
                  — it replies with your numeric chat id. Paste it here.
                </p>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={t.manualId}
                    onChange={(e) => t.setManualId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && t.linkManually()}
                    inputMode="numeric"
                    placeholder="123456789"
                    className="min-w-0 flex-1 rounded-md border border-white/12 bg-black/40 px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-brass/50"
                  />
                  <button
                    onClick={() => t.linkManually()}
                    className="shrink-0 rounded-md border border-brass/45 bg-brass/12 px-3 py-1.5 text-[11.5px] text-brass-soft"
                  >
                    Link
                  </button>
                </div>
                {t.manualErr && <p className="mt-1.5 text-[10.5px] text-rose-300">{t.manualErr}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
