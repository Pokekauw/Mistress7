/* ==================================================================== *
 *  GET /api/telegram/status?code=MTLEFSB6CO[&house=house-of-ash]
 *
 *  Has this pairing code been claimed by a Telegram chat yet?
 *
 *  The app normally reads Firestore directly, which is faster. This exists
 *  as a fallback for the case that actually bites in production: the
 *  deployed bundle is missing its VITE_FIREBASE_* variables, so the client
 *  cannot reach Firestore at all — but the server still can, because it
 *  reads its own unprefixed configuration per request.
 *
 *  Security: the code is a short-lived, unguessable secret, and knowing it
 *  is what proves you are the person mid-link. Same model as the direct
 *  Firestore read. Expired records are refused.
 * ==================================================================== */

import { SERVER_ENV, canWriteFirestore, missingFirestoreVars, safePathSegment } from "../_shared/env";
import { readDoc, telegramLinkPath } from "../_shared/firestore";

const cors = {
  "Access-Control-Allow-Origin": SERVER_ENV.appOrigin,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);

  if (!canWriteFirestore()) {
    return json(
      {
        linked: false,
        error: "not-configured",
        detail: `Server is missing: ${missingFirestoreVars().join(", ")}`,
      },
      503
    );
  }

  const url = new URL(req.url);
  const code = safePathSegment((url.searchParams.get("code") || "").toUpperCase());
  const house = safePathSegment(url.searchParams.get("house") || "", SERVER_ENV.houseId);

  if (!code) return json({ linked: false, error: "code is required" }, 400);

  const path = telegramLinkPath(house, code);
  if (!path) return json({ linked: false, error: "bad code" }, 400);

  const read = await readDoc(path);
  if (!read.ok) {
    console.error(`[telegram] status read failed (${read.reason})`, read.detail || "");
    return json({ linked: false, error: read.reason }, 502);
  }

  const d = read.data;
  if (!d || !d.chatId) return json({ linked: false });

  const expiresAt = typeof d.expiresAt === "number" ? d.expiresAt : 0;
  if (expiresAt && expiresAt < Date.now()) return json({ linked: false, error: "expired" });

  return json({
    linked: true,
    chatId: String(d.chatId),
    username: d.username ? String(d.username) : undefined,
  });
}

export const config = { runtime: "edge" };
