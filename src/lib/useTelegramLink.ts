import { useCallback, useEffect, useRef, useState } from "react";
import { linkTelegram, setTelegramBot, telegramLinkCode, useStore, type Slave } from "./store";
import { fetchLinkStatus, isValidBotUsername, linkUrl, normaliseBotUsername, resolveBotUsername } from "./telegram";
import { fetchTelegramLink } from "./fire";
import { HOUSE_ID, isFirebase } from "../firebase";
import { configBlockerMessage } from "./env";
import { diagnoseLink, isValidChatId, type Diagnosis } from "./diagnose";

/**
 * All of the pairing behaviour, in one place, so the inline card in the
 * chat and the full panel cannot drift apart.
 *
 * Confirmation is mostly automatic: once he opens the bot we poll, and we
 * re-check the moment he returns to the tab — which is exactly when the
 * link has just been made.
 */
const POLL_MS = 3000;
const POLL_WINDOW_MS = 120_000;
/** stop pretending and explain, once this many polls have found nothing */
const DIAGNOSE_AFTER = 4;

export function useTelegramLink(slave: Slave) {
  const houseBot = useStore((s) => s.dungeon.telegramBot);

  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [draftBot, setDraftBot] = useState("");
  const [botErr, setBotErr] = useState("");
  const [editingBot, setEditingBot] = useState(false);
  const [watching, setWatching] = useState(false);
  /** true for a few seconds after a successful link, to celebrate it */
  const [justLinked, setJustLinked] = useState(false);
  /** why nothing is arriving — resolved after a few fruitless polls */
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [manualId, setManualId] = useState("");
  const [manualErr, setManualErr] = useState("");
  const attempts = useRef(0);

  const linked = Boolean(slave.telegram?.chatId);

  /* house setting first, build-time VITE_TELEGRAM_BOT_USERNAME second */
  const bot = resolveBotUsername(houseBot);
  const hasBot = Boolean(bot) && !editingBot;

  /* ---- pairing code: created in an effect, never during render ---- */
  const code = slave.telegramCode || "";
  useEffect(() => {
    if (!code && !linked) telegramLinkCode(slave.id);
  }, [code, linked, slave.id]);

  /* ---- confirmation ----
     Firestore direct when the client can reach it, otherwise the server
     endpoint — which still works on a deployment missing VITE_FIREBASE_*. */
  const check = useCallback(
    async (manual: boolean) => {
      if (!code || linked) return false;
      if (manual) {
        setChecking(true);
        setErr("");
      }

      let found = isFirebase ? await fetchTelegramLink(code) : null;
      let serverReachable = true;

      if (!found) {
        const status = await fetchLinkStatus(code, HOUSE_ID);
        if (status.linked) found = { chatId: status.chatId, username: status.username };
        else if (status.error === "unreachable" || status.error === "not-configured") serverReachable = false;
      }

      if (manual) setChecking(false);

      if (found) {
        linkTelegram(slave.id, found);
        setWatching(false);
        setErr("");
        setDiagnosis(null);
        attempts.current = 0;
        setJustLinked(true);
        window.setTimeout(() => setJustLinked(false), 6000);
        return true;
      }

      /* Nothing arrived. After a few tries, stop implying patience will
         help and work out which link in the chain is actually broken. */
      attempts.current += 1;
      if (manual || attempts.current >= DIAGNOSE_AFTER) {
        if (!diagnosis) setDiagnosis(await diagnoseLink());
      }

      if (manual && !diagnosis) {
        setErr(
          !isFirebase && !serverReachable
            ? configBlockerMessage() || "Linking is not available on this deployment."
            : "Not linked yet. Send the bot your code — this will confirm itself once you do."
        );
      }
      return false;
    },
    [code, linked, slave.id, diagnosis]
  );

  /** last resort: bind a chat id by hand, no backend required */
  const linkManually = useCallback(() => {
    const id = manualId.trim();
    if (!isValidChatId(id)) {
      setManualErr("A Telegram chat id is 5–15 digits. Get yours by messaging @userinfobot.");
      return false;
    }
    linkTelegram(slave.id, { chatId: id });
    setManualErr("");
    setManualId("");
    setWatching(false);
    setDiagnosis(null);
    setJustLinked(true);
    window.setTimeout(() => setJustLinked(false), 6000);
    return true;
  }, [manualId, slave.id]);

  /* poll while waiting, and give up after the window closes */
  const startedAt = useRef(0);
  useEffect(() => {
    if (!watching || linked) return;
    startedAt.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - startedAt.current > POLL_WINDOW_MS) {
        setWatching(false);
        return;
      }
      void check(false);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [watching, linked, check]);

  /* he comes back from Telegram — the likeliest moment to succeed */
  useEffect(() => {
    if (linked) return;
    const onBack = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [linked, check]);

  const saveBot = useCallback(() => {
    const clean = normaliseBotUsername(draftBot);
    if (!isValidBotUsername(clean)) {
      setBotErr("A Telegram handle is 5–32 characters: letters, numbers and underscores.");
      return false;
    }
    setTelegramBot(clean);
    setDraftBot("");
    setBotErr("");
    setEditingBot(false);
    return true;
  }, [draftBot]);

  const copyCode = useCallback(() => {
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  return {
    /* state */
    linked,
    justLinked,
    bot,
    hasBot,
    houseBot,
    code,
    checking,
    watching,
    err,
    copied,
    draftBot,
    botErr,
    editingBot,
    /** deep link: bot + pairing code + the house it belongs to */
    href: linkUrl(code, bot, HOUSE_ID),
    /** null unless this deployment is missing configuration */
    blocker: configBlockerMessage(),
    /** why nothing is arriving, once we have worked it out */
    diagnosis,
    manualId,
    manualErr,
    setManualId,
    linkManually,
    /** plain profile link: https://t.me/<username> */
    botHref: bot ? `https://t.me/${bot}` : "",
    /* actions */
    check,
    saveBot,
    copyCode,
    setDraftBot,
    setBotErr,
    setEditingBot,
    setWatching,
  };
}
