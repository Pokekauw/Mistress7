/* ==================================================================== *
 *  /api/telegram/verify
 *
 *  GET  ?code=MTLEFSB6CO[&house=…]   → has this code been claimed?
 *  POST { code, chatId, username? }  → claim it directly
 *
 *  GET is what the PWA polls. POST exists for a bot running in polling
 *  mode rather than via webhook — long-poll getUpdates on your own
 *  process, then post any code you see here.
 *
 *  A pairing code is a short-lived, unguessable secret; holding it is
 *  what proves you are the person mid-link. Records expire, and an
 *  already-claimed code cannot be re-pointed at a different chat.
 * ==================================================================== */

import { SERVER_ENV, canWriteFirestore, missingFirestoreVars, safePathSegment } from "../_shared/env";
import { readDoc, telegramLinkPath, upsertDoc } from "../_shared/firestore";

const LINK_TTL_MS = 15 * 60 * 1000;

const cors = {
  "Access-Control-Allow-Origin": SERVER_ENV.appOrigin,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!canWriteFirestore()) {
    return json(
      { linked: false, error: "not-configured", detail: `Server is missing: ${missingFirestoreVars().join(", ")}` },
      503
    );
  }

  /* ---------------- GET: poll ---------------- */
  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = safePathSegment((url.searchParams.get("code") || "").toUpperCase());
    const house = safePathSegment(url.searchParams.get("house") || "", SERVER_ENV.houseId);
    if (!code) return json({ linked: false, error: "code is required" }, 400);

    const path = telegramLinkPath(house, code);
    if (!path) return json({ linked: false, error: "bad code" }, 400);

    const read = await readDoc(path);
    if (!read.ok) return json({ linked: false, error: read.reason }, 502);

    const d = read.data;
    if (!d?.chatId) return json({ linked: false });

    const expiresAt = typeof d.expiresAt === "number" ? d.expiresAt : 0;
    if (expiresAt && expiresAt < Date.now()) return json({ linked: false, error: "expired" });

    return json({
      linked: true,
      chatId: String(d.chatId),
      username: d.username ? String(d.username) : undefined,
    });
  }

  /* ---------------- POST: claim ---------------- */
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  let body: { code?: string; chatId?: string | number; username?: string; house?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const code = safePathSegment(String(body.code || "").toUpperCase());
  const chatId = String(body.chatId ?? "").trim();
  const house = safePathSegment(body.house || "", SERVER_ENV.houseId);

  if (!code) return json({ error: "code is required" }, 400);
  if (!/^-?\d{5,15}$/.test(chatId)) return json({ error: "a numeric chatId is required" }, 400);

  const path = telegramLinkPath(house, code);
  if (!path) return json({ error: "bad code" }, 400);

  /* a claimed code belongs to whoever claimed it first */
  const existing = await readDoc(path);
  if (existing.ok && existing.data?.chatId && String(existing.data.chatId) !== chatId) {
    return json({ error: "This code has already been claimed." }, 409);
  }

  const now = Date.now();
  const write = await upsertDoc(path, {
    chatId,
    username: body.username || "",
    houseId: house,
    code,
    linkedAt: now,
    expiresAt: now + LINK_TTL_MS,
    consumed: false,
  });

  if (!write.ok) {
    console.error(`[telegram] verify write failed (${write.reason})`, write.detail || "");
    return json({ error: write.reason, detail: write.detail }, 502);
  }

  console.info(`[telegram] verify claimed ${code} → chat ${chatId} (house ${house})`);
  return json({ ok: true, linked: true, chatId });
}

export const config = { runtime: "edge" };
