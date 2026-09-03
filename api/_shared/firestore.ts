/* ==================================================================== *
 *  FIRESTORE REST
 *
 *  The webhook runs on an edge runtime where the Admin SDK is unavailable
 *  and unnecessary — one document write does not justify the bundle. This
 *  is a thin, honest wrapper over the REST API.
 * ==================================================================== */

import { SERVER_ENV, canWriteFirestore, missingFirestoreVars, safePathSegment } from "./env";

export type WriteResult = { ok: true } | { ok: false; reason: string; detail?: string };

const BASE = "https://firestore.googleapis.com/v1";

function docUrl(path: string) {
  const key = SERVER_ENV.apiKey ? `?key=${encodeURIComponent(SERVER_ENV.apiKey)}` : "";
  return `${BASE}/projects/${SERVER_ENV.projectId}/databases/(default)/documents/${path}${key}`;
}

/**
 * Create-or-replace a document.
 *
 * PATCH rather than POST is deliberate: POST with documentId fails with
 * ALREADY_EXISTS on a repeat, which is exactly what happens when someone
 * sends /start twice. PATCH is idempotent, so a retry simply succeeds.
 */
export async function upsertDoc(path: string, fields: Record<string, unknown>): Promise<WriteResult> {
  if (!canWriteFirestore()) {
    return {
      ok: false,
      reason: "not-configured",
      detail: `Missing server environment variables: ${missingFirestoreVars().join(", ")}`,
    };
  }

  try {
    const res = await fetch(docUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreFields(fields) }),
    });

    if (res.ok) return { ok: true };

    const body = await res.text().catch(() => "");
    /* 403 here almost always means security rules, not credentials */
    const reason =
      res.status === 403
        ? "permission-denied"
        : res.status === 404
          ? "not-found"
          : res.status === 401
            ? "unauthenticated"
            : `http-${res.status}`;

    return { ok: false, reason, detail: body.slice(0, 400) };
  } catch (e) {
    return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
  }
}

export type ReadResult =
  | { ok: true; data: Record<string, unknown> | null }
  | { ok: false; reason: string; detail?: string };

/** fetch a single document; `data: null` means it simply does not exist yet */
export async function readDoc(path: string): Promise<ReadResult> {
  if (!canWriteFirestore()) {
    return {
      ok: false,
      reason: "not-configured",
      detail: `Missing server environment variables: ${missingFirestoreVars().join(", ")}`,
    };
  }

  try {
    const res = await fetch(docUrl(path), { method: "GET" });
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: res.status === 403 ? "permission-denied" : `http-${res.status}`, detail: body.slice(0, 400) };
    }
    const body = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
    return { ok: true, data: fromFirestoreFields(body.fields || {}) };
  } catch (e) {
    return { ok: false, reason: "network", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Firestore typed values → plain JS */
function fromFirestoreFields(fields: Record<string, Record<string, unknown>>) {
  const out: Record<string, unknown> = {};
  for (const [k, wrapper] of Object.entries(fields)) {
    const [kind, value] = Object.entries(wrapper)[0] || [];
    if (kind === "integerValue") out[k] = Number(value);
    else if (kind === "doubleValue") out[k] = Number(value);
    else if (kind === "booleanValue") out[k] = Boolean(value);
    else if (kind === "nullValue") out[k] = null;
    else out[k] = value;
  }
  return out;
}

/** minimal JS → Firestore typed-value mapping */
function toFirestoreFields(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) out[k] = { nullValue: null };
    else if (typeof v === "string") out[k] = { stringValue: v };
    else if (typeof v === "boolean") out[k] = { booleanValue: v };
    else if (typeof v === "number")
      out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else out[k] = { stringValue: String(v) };
  }
  return out;
}

/** houses/{house}/telegramLinks/{code} — both segments sanitised */
export function telegramLinkPath(houseId: string, code: string): string | null {
  const house = safePathSegment(houseId, SERVER_ENV.houseId);
  const doc = safePathSegment(code);
  if (!house || !doc) return null;
  return `houses/${house}/telegramLinks/${doc}`;
}
