/* ==================================================================== *
 *  POST /api/telegram/webhook
 *
 *  Receives updates from the Telegram Bot API and records the chat so the
 *  app can complete a link.
 *
 *  Two ways in, because people do both:
 *    • /start CODE     — the deep link button (payload may carry the house)
 *    • CODE            — typed or pasted straight into the chat
 *
 *  GET the same URL for a configuration report (no secrets).
 *
 *  Runtime-agnostic: a standard (Request) => Response handler, so it runs
 *  unchanged on Vercel, Netlify Edge and Cloudflare Workers.
 *
 *  Register once with Telegram:
 *    curl -F "url=https://YOUR-DOMAIN/api/telegram/webhook" \
 *         -F "secret_token=YOUR_WEBHOOK_SECRET" \
 *         https://api.telegram.org/bot<TOKEN>/setWebhook
 * ==================================================================== */

import { SERVER_ENV, canWriteFirestore, configStatus, missingFirestoreVars, safePathSegment } from "../_shared/env";
import { telegramLinkPath, upsertDoc } from "../_shared/firestore";

/** how long a pairing record stays claimable */
const LINK_TTL_MS = 15 * 60 * 1000;

/** pairing codes are 6–16 chars, letters and digits — e.g. MTLEFSB6CO */
const CODE_RE = /^[A-Za-z0-9]{6,16}$/;

type Update = {
  message?: {
    chat: { id: number; username?: string; first_name?: string };
    text?: string;
  };
};

const api = (method: string) => `https://api.telegram.org/bot${SERVER_ENV.botToken}/${method}`;

async function reply(chatId: number, text: string) {
  if (!SERVER_ENV.botToken) {
    console.error("[telegram] cannot reply — TELEGRAM_BOT_TOKEN is not set");
    return;
  }
  try {
    const res = await fetch(api("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("[telegram] sendMessage failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[telegram] sendMessage threw", e);
  }
}

/**
 * A /start payload carries the pairing code and, optionally, the house it
 * belongs to: `CODE__house-id`.
 *
 * Carrying the house avoids the failure where the server's HOUSE_ID and
 * the client's VITE_HOUSE_ID disagree — the webhook would write to one
 * house while the app polled another, and the link would never complete.
 * Untrusted input, so both halves are sanitised.
 */
function parsePayload(raw: string): { code: string; houseId: string } {
  const [rawCode = "", rawHouse = ""] = raw.split("__");
  return {
    code: safePathSegment(rawCode.toUpperCase()),
    houseId: safePathSegment(rawHouse, SERVER_ENV.houseId),
  };
}

/** the whole of step 1: write the chat where the app is looking for it */
async function claim(
  chatId: number,
  code: string,
  houseId: string,
  username?: string,
  firstName?: string
): Promise<Response> {
  if (!canWriteFirestore()) {
    const missing = missingFirestoreVars().join(", ");
    console.error(`[telegram] cannot record link — missing server env: ${missing}`);
    await reply(
      chatId,
      "⚠️ <b>Not linked.</b>\n\nThis house is not finished setting up, so the link could not be saved. " +
        "Tell your Mistress the server is missing its database configuration.\n\n" +
        "<i>Nothing is wrong on your side.</i>"
    );
    return json({ ok: false, reason: "not-configured", missing });
  }

  const path = telegramLinkPath(houseId, code);
  if (!path) {
    await reply(chatId, "⚠️ That code is not valid. Return to the app and use the link button again.");
    return json({ ok: false, reason: "bad-code" });
  }

  const now = Date.now();
  const write = await upsertDoc(path, {
    chatId: String(chatId),
    username: username || "",
    firstName: firstName || "",
    houseId,
    code,
    linkedAt: now,
    expiresAt: now + LINK_TTL_MS,
    consumed: false,
  });

  if (!write.ok) {
    console.error(`[telegram] link write failed (${write.reason})`, write.detail || "");
    const hint =
      write.reason === "permission-denied"
        ? "the database is refusing writes (security rules)"
        : write.reason === "not-found"
          ? "the database could not be found"
          : "the database could not be reached";
    await reply(
      chatId,
      `⚠️ <b>Not linked.</b>\n\nYour message arrived, but ${hint}. ` +
        "Tell your Mistress.\n\n<i>Nothing is wrong on your side.</i>"
    );
    return json({ ok: false, reason: write.reason });
  }

  console.info(`[telegram] linked chat ${chatId} → houses/${houseId} code ${code}`);
  await reply(
    chatId,
    "⛓️ <b>Linked.</b>\n\nYour Mistress can now reach you here. " +
      "You will be told when a decree, penance or check-in is issued.\n\n" +
      "<i>Return to the app — it confirms itself.</i>"
  );
  return json({ ok: true });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async function handler(req: Request): Promise<Response> {
  /* ---- health check: is this deployment configured? ---- */
  if (req.method === "GET") {
    return json({ service: "telegram-webhook", ...configStatus() }, canWriteFirestore() && SERVER_ENV.botToken ? 200 : 503);
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  /* Telegram echoes the secret back on every call — reject anything else */
  if (SERVER_ENV.webhookSecret && req.headers.get("x-telegram-bot-api-secret-token") !== SERVER_ENV.webhookSecret) {
    console.warn("[telegram] rejected webhook call with bad or missing secret token");
    return new Response("Forbidden", { status: 403 });
  }

  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text) return new Response("ok");

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  /* ---- /start [CODE[__house]] ---- */
  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1]?.trim() || "";
    const { code, houseId } = parsePayload(payload);

    if (code) return claim(chatId, code, houseId, msg.chat.username, msg.chat.first_name);

    await reply(
      chatId,
      "🖤 <b>House of Dom</b>\n\nThis bot delivers your Mistress's orders.\n\n" +
        "Send me your verification code, or open <b>Link Telegram</b> in the app " +
        "and use the button — it carries the code for you."
    );
    return new Response("ok");
  }

  /* ---- /stop ---- */
  if (text === "/stop") {
    await reply(chatId, "🔕 You will receive nothing further here.");
    return new Response("ok");
  }

  /* ---- /status ---- */
  if (text === "/status") {
    await reply(chatId, `📜 Open the app to see your standing.${SERVER_ENV.appUrl ? `\n${SERVER_ENV.appUrl}` : ""}`);
    return new Response("ok");
  }

  /* ---- a bare code, typed or pasted straight into the chat ----
     This is how most people actually do it, so it must work without
     the deep link. No house in the payload, so fall back to the
     server's configured house. */
  const bare = text.replace(/\s+/g, "");
  if (CODE_RE.test(bare)) {
    return claim(chatId, bare.toUpperCase(), SERVER_ENV.houseId, msg.chat.username, msg.chat.first_name);
  }

  await reply(
    chatId,
    "This channel is for delivery only. You do not speak to her here. 🤐\n\n" +
      "<i>If you meant to link, send only your verification code.</i>"
  );
  return new Response("ok");
}

export const config = { runtime: "edge" };
