/* ==================================================================== *
 *  POST /api/telegram/send
 *
 *  The relay. The browser posts { chatId, text, action } here and this
 *  function — the only thing holding the bot token — forwards it.
 *
 *  GET the same URL for a configuration report (no secrets).
 * ==================================================================== */

import { SERVER_ENV, configStatus } from "../_shared/env";

type Body = {
  chatId?: string;
  text?: string;
  action?: { label: string; url: string };
  silent?: boolean;
};

const cors = {
  "Access-Control-Allow-Origin": SERVER_ENV.appOrigin,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

/* naive per-chat throttle — a burst of batch commands must not spam him */
const lastSent = new Map<string, number>();
const MIN_GAP_MS = 1500;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method === "GET") {
    return json({ service: "telegram-send", ...configStatus() }, SERVER_ENV.botToken ? 200 : 503);
  }

  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  if (!SERVER_ENV.botToken) {
    console.error("[telegram] send called but TELEGRAM_BOT_TOKEN is not set on the server");
    return json(
      { error: "Bot token not configured on the server. Set TELEGRAM_BOT_TOKEN in your host's environment." },
      503
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const { chatId, text, action, silent } = body;
  if (!chatId || !text) return json({ error: "chatId and text are required" }, 400);
  if (text.length > 4000) return json({ error: "Message too long" }, 400);

  const now = Date.now();
  const prev = lastSent.get(chatId) || 0;
  if (now - prev < MIN_GAP_MS) return json({ ok: true, throttled: true });
  lastSent.set(chatId, now);

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    disable_notification: Boolean(silent),
  };

  if (action?.url) {
    payload.reply_markup = { inline_keyboard: [[{ text: action.label, url: action.url }]] };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${SERVER_ENV.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok) {
      console.error("[telegram] Telegram refused the message:", data.description);
      return json({ error: data.description || "Telegram refused the message" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[telegram] could not reach Telegram", e);
    return json({ error: "Could not reach Telegram" }, 502);
  }
}

export const config = { runtime: "edge" };
