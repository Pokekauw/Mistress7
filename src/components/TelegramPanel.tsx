import { useEffect } from "react";
import { ENV_BOT_USERNAME } from "../lib/telegram";
import { useTelegramLink } from "../lib/useTelegramLink";
import { unlinkTelegram, type Slave } from "../lib/store";

/**
 * The full pairing panel, reached from the header bell. Shares all of its
 * behaviour with the inline card in the chat via useTelegramLink, so the
 * two can never fall out of step.
 *
 * Linking is deliberately his responsibility: he messages the bot, the
 * webhook records the chat, and it confirms itself. She never handles his id.
 */
export default function TelegramPanel({ slave, onClose }: { slave: Slave; onClose: () => void }) {
  const t = useTelegramLink(slave);

  /* the moment it connects, show the confirmation then step out of the way */
  useEffect(() => {
    if (!t.justLinked) return;
    const id = window.setTimeout(onClose, 2200);
    return () => window.clearTimeout(id);
  }, [t.justLinked, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="thin-scroll max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-brass/25 bg-gradient-to-b from-[#161018] to-[#0a070b] p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-[20px]">
            🔔
          </span>
          <div>
            <div className="label">Telegram</div>
            <div className="font-display text-[1.4rem] leading-none text-white">Order delivery</div>
          </div>
        </div>

        {t.linked ? (
          <>
            <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4 text-center">
              <div className="text-[22px]">✅</div>
              <div className="mt-1.5 text-[13.5px] text-emerald-100">Linked</div>
              <div className="mt-0.5 font-mono text-[11px] text-white/45">
                {slave.telegram?.username ? `@${slave.telegram.username}` : `chat ${slave.telegram?.chatId}`}
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-white/50">
              Her decrees, penances and check-in demands will reach your phone the moment they are issued. You cannot
              reply through the bot — it delivers only. 🤐
            </p>
            <button
              onClick={() => {
                unlinkTelegram(slave.id);
                onClose();
              }}
              className="mt-5 w-full rounded-lg border border-white/12 py-2.5 text-[12.5px] text-white/55 hover:border-rose-400/40 hover:text-rose-300"
            >
              Unlink this device
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
              Receive her orders on your phone, free of charge. Two taps.
            </p>

            <ol className="mt-4 space-y-3">
              {/* ---------- 1 · open the bot ---------- */}
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[10px] text-brass-soft">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-white/80">Open the bot</div>

                  {t.hasBot ? (
                    <>
                      <a
                        href={t.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => t.setWatching(true)}
                        className="mt-1.5 inline-block rounded-lg border border-brass/50 bg-brass/15 px-3.5 py-2 text-[12px] text-brass-soft transition hover:bg-brass/25"
                      >
                        Open @{t.bot} ↗
                      </a>
                      <div className="mt-1 flex items-center gap-2">
                        <a
                          href={t.botHref}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[9.5px] break-all text-white/25 underline underline-offset-2 hover:text-white/50"
                        >
                          t.me/{t.bot}
                        </a>
                        <span className="font-mono text-[9px] text-white/20">
                          · {t.houseBot ? "house setting" : "env"}
                        </span>
                        <button
                          onClick={() => {
                            t.setDraftBot(t.bot);
                            t.setEditingBot(true);
                          }}
                          className="ml-auto shrink-0 text-[9.5px] text-white/25 hover:text-white/60"
                        >
                          change
                        </button>
                      </div>
                    </>
                  ) : (
                    /* no handle yet — set it here rather than sending her to a config file */
                    <div className="mt-1.5 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] p-3">
                      <p className="text-[11.5px] leading-relaxed text-amber-100/85">
                        No bot handle set for this house yet. Enter it below — it saves instantly, no rebuild needed.
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
                      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
                        Get one free from @BotFather. Paste the handle, a t.me link, or plain text — all work.
                        {ENV_BOT_USERNAME && (
                          <>
                            {" "}
                            Build-time default: <span className="text-white/50">@{ENV_BOT_USERNAME}</span>.
                          </>
                        )}
                      </p>
                      {t.editingBot && (
                        <button
                          onClick={() => {
                            t.setEditingBot(false);
                            t.setBotErr("");
                          }}
                          className="mt-1.5 text-[10px] text-white/30 hover:text-white/60"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>

              {/* ---------- 2 · the pairing code ---------- */}
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[10px] text-brass-soft">
                  2
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-white/80">Send it this code</div>
                  <button
                    onClick={t.copyCode}
                    disabled={!t.code}
                    title="Copy"
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 text-center font-mono text-[1.1rem] tracking-[0.2em] text-brass-soft transition hover:border-brass/45 disabled:opacity-40"
                  >
                    {!t.code ? "…" : t.copied ? "Copied ✓" : t.code}
                  </button>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-white/30">
                    {t.hasBot
                      ? "The button above sends it for you. Only paste it if you opened Telegram yourself."
                      : "Set a bot handle first."}
                  </p>
                </div>
              </li>

              {/* ---------- 3 · confirmation, mostly automatic ---------- */}
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brass/40 font-mono text-[10px] text-brass-soft">
                  3
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-white/80">Confirm</div>

                  {t.watching ? (
                    <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-brass/30 bg-brass/[0.07] px-3 py-2.5">
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
                      className="mt-1.5 w-full rounded-lg border border-brass/50 bg-gradient-to-r from-brass/28 to-brass/10 py-2.5 text-[12.5px] text-brass-soft transition hover:from-brass/40 disabled:opacity-50"
                    >
                      {t.checking ? "⏳ Checking…" : "I have messaged the bot"}
                    </button>
                  )}

                  <p className="mt-1 text-[10px] leading-relaxed text-white/25">
                    This confirms itself when you return from Telegram.
                  </p>
                </div>
              </li>
            </ol>

            {t.err && !t.diagnosis && <p className="mt-3 text-[11.5px] leading-snug text-rose-300">{t.err}</p>}

            {t.diagnosis && (
              <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] p-3">
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
                      — it replies with your numeric chat id.
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
          </>
        )}

        <button onClick={onClose} className="mt-5 w-full rounded-lg border border-white/12 py-2.5 text-[13px] text-white/60">
          Close
        </button>
      </div>
    </div>
  );
}
