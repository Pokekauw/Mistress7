/* ==================================================================== *
 *  TELEGRAM NOTIFICATION ENGINE
 *
 *  Telegram's Bot API is free and unmetered, which makes it the cheapest
 *  way to reach a submissive's phone.
 *
 *  ⚠️  SECURITY
 *  The bot token must NEVER reach the browser. Anything prefixed with
 *  VITE_ is compiled into the client bundle and is effectively public.
 *  So the token lives only on the server, and this module talks to a
 *  small relay endpoint (see api/telegram/send.ts).
 * ==================================================================== */

/**
 * Accepts anything a person is likely to paste — `@mybot`, `mybot`,
 * `t.me/mybot`, `https://t.me/mybot` — and returns the bare handle.
 */
export function normaliseBotUsername(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?(?:t|telegram)\.me\//i, "")
    .replace(/^@/, "")
    .split(/[/?#\s]/)[0]
    .replace(/[^A-Za-z0-9_]/g, "");
}

/** Compiled in at build time. Empty unless VITE_TELEGRAM_BOT_USERNAME is set. */
export const ENV_BOT_USERNAME = normaliseBotUsername(import.meta.env.VITE_TELEGRAM_BOT_USERNAME);

export const RELAY_URL = (import.meta.env.VITE_TELEGRAM_RELAY_URL || "/api/telegram/send").trim();

/**
 * Which bot this house uses.
 *
 * A house-level setting wins over the build-time variable. That matters
 * for two reasons: each house can run its own bot, and the handle can be
 * changed from the interface without an env edit and a rebuild.
 */
export function resolveBotUsername(houseValue?: string | null): string {
  return normaliseBotUsername(houseValue) || ENV_BOT_USERNAME;
}

/** Telegram handles are 5–32 chars, alphanumeric plus underscore. */
export function isValidBotUsername(u: string): boolean {
  return /^[A-Za-z0-9_]{5,32}$/.test(u);
}



export type TelegramLink = {
  chatId: string;
  username?: string;
  linkedAt: number;
};

/* ------------------------------------------------------------------ *
 *  linking                                                            *
 * ------------------------------------------------------------------ */

/**
 * A short one-time code the submissive sends to the bot. Telegram passes
 * it through as the /start payload, which lets the webhook match the
 * chat to a profile without either party typing an id.
 */
export function makeLinkCode(slaveId: string) {
  return `${slaveId.slice(0, 6)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

/**
 * Deep link that opens the bot with the pairing payload pre-filled.
 *
 * The payload carries the house alongside the code (`CODE__house-id`), so
 * the webhook writes to the same house the app is polling even if the
 * server's HOUSE_ID and the client's VITE_HOUSE_ID were set differently.
 * Telegram allows A–Z a–z 0–9 _ and - in a start payload, so both fit.
 */
export function startPayload(code: string, houseId?: string): string {
  const house = (houseId || "").replace(/[^A-Za-z0-9_-]/g, "");
  return house ? `${code}__${house}` : code;
}

export function linkUrl(code: string, username?: string, houseId?: string): string {
  const bot = normaliseBotUsername(username) || ENV_BOT_USERNAME;
  if (!bot || !code) return "";
  return `https://t.me/${bot}?start=${encodeURIComponent(startPayload(code, houseId))}`;
}

/** plain profile link, no payload */
export function botUrl(username?: string): string {
  const bot = normaliseBotUsername(username) || ENV_BOT_USERNAME;
  return bot ? `https://t.me/${bot}` : "";
}

/* ------------------------------------------------------------------ *
 *  link status (server fallback)                                      *
 * ------------------------------------------------------------------ */

export type LinkStatus =
  | { linked: true; chatId: string; username?: string }
  | { linked: false; error?: string };

/**
 * Ask the server whether a pairing code has been claimed.
 *
 * The app reads Firestore directly when it can — this is the fallback for
 * a deployment whose client bundle is missing VITE_FIREBASE_*, where the
 * browser cannot reach Firestore but the server still can.
 */
export async function fetchLinkStatus(code: string, houseId?: string): Promise<LinkStatus> {
  if (!code) return { linked: false };
  const base = RELAY_URL.replace(/\/send\/?$/, "/status");
  const url = `${base}?code=${encodeURIComponent(code)}${houseId ? `&house=${encodeURIComponent(houseId)}` : ""}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { linked: false, error: `http-${res.status}` };
    return (await res.json()) as LinkStatus;
  } catch {
    /* endpoint not deployed, offline, or blocked */
    return { linked: false, error: "unreachable" };
  }
}

/* ------------------------------------------------------------------ *
 *  sending                                                            *
 * ------------------------------------------------------------------ */

export type TelegramMessage = {
  chatId: string;
  text: string;
  /** shown as a tappable button beneath the message */
  action?: { label: string; url: string };
  silent?: boolean;
};

/** Telegram MarkdownV2 needs a lot of escaping; HTML is far less fragile. */
export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fire-and-forget delivery through the relay. Never throws and never
 * blocks the UI — a failed notification must not break a command.
 */
export async function sendTelegram(msg: TelegramMessage): Promise<boolean> {
  if (!msg.chatId) return false;
  try {
    const res = await fetch(RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    return res.ok;
  } catch {
    /* offline, relay not deployed, or blocked — silently ignore */
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  message templates                                                  *
 * ------------------------------------------------------------------ */

export type AlertKind = "decree" | "penance" | "checkin" | "tribute" | "media" | "gag" | "lock" | "verdict";

/**
 * The push policy, in one list.
 *
 * The phone only buzzes for the three things that cannot wait:
 *   • a decree she has issued
 *   • a check-in she has demanded
 *   • media she has sent him
 *
 * Everything else — ordinary chat messages, verdicts, penalties, gags,
 * locks, penance, tribute — stays inside the app and never wakes him.
 */
export const PUSH_KINDS: readonly AlertKind[] = ["decree", "checkin", "media"];

export function isPushKind(kind: AlertKind): boolean {
  return PUSH_KINDS.includes(kind);
}

const TEMPLATES: Record<AlertKind, { title: string; cta: string }> = {
  decree: { title: "📜 <b>A decree from your Mistress</b>", cta: "Read it" },
  penance: { title: "⛓️ <b>Penance assigned</b>", cta: "Submit proof" },
  checkin: { title: "📍 <b>Location check-in demanded</b>", cta: "Confirm now" },
  tribute: { title: "💰 <b>Tribute demanded</b>", cta: "Render tribute" },
  media: { title: "👠 <b>She has sent you something</b>", cta: "Look" },
  gag: { title: "🤐 <b>You have been silenced</b>", cta: "See your standing" },
  lock: { title: "🔒 <b>You are held in chastity</b>", cta: "See your standing" },
  verdict: { title: "⚖️ <b>Judgement passed</b>", cta: "Read it" },
};

export function buildAlert(kind: AlertKind, body: string, houseName: string, appUrl: string): Omit<TelegramMessage, "chatId"> {
  const t = TEMPLATES[kind];
  return {
    text: `${t.title}\n\n${escapeHtml(body)}\n\n<i>${escapeHtml(houseName)}</i>`,
    action: appUrl ? { label: t.cta, url: appUrl } : undefined,
  };
}
