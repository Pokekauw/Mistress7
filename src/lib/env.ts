/* ==================================================================== *
 *  CLIENT CONFIGURATION
 *
 *  One place that answers "is this deployment actually configured?" and
 *  says plainly what is missing, instead of failing silently three
 *  screens later.
 *
 *  ⚠️  VITE_ variables are inlined at BUILD time. Setting them in a
 *  hosting dashboard after a build has already run changes nothing until
 *  you redeploy. That is the single most common cause of a local build
 *  working while production reports "not configured".
 * ==================================================================== */

const env = import.meta.env;

const read = (v?: string) => (v ?? "").trim();

/* ------------------------------------------------------------------ *
 *  Storage bucket                                                     *
 *                                                                     *
 *  An empty bucket is not a harmless default. `getStorage(app)` still  *
 *  builds a request when `storageBucket` is "", and that request goes  *
 *  to `/v0/b//o/` — a path with no bucket in it, which can only ever   *
 *  fail (400/404, or a CORS error that hides the real cause).          *
 *                                                                     *
 *  So the bucket is resolved ONCE, here, with the house bucket as the  *
 *  fallback instead of "". Everything downstream — firebase.ts,        *
 *  getStorage(app, bucket), the diagnostics — reads the same value.    *
 * ------------------------------------------------------------------ */

/** the bucket this house uploads to when VITE_FIREBASE_STORAGE_BUCKET is absent */
export const DEFAULT_STORAGE_BUCKET = "house-of-dom.firebasestorage.app";

/**
 * Accept the forms people actually paste into an env field:
 * `gs://house-of-dom.firebasestorage.app`, the bare name, a copy of the
 * browser URL, stray quotes, whitespace or a trailing slash.
 */
export function normaliseBucket(raw?: string): string {
  let b = read(raw).replace(/^["']|["']$/g, "");
  if (!b) return "";
  b = b.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // gs://, https://, http://
  b = b.split(/[/?#]/)[0]; // a bucket name never contains a path, query or hash
  return b;
}

export const CLIENT_ENV = {
  firebase: {
    apiKey: read(env.VITE_FIREBASE_API_KEY),
    authDomain: read(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: read(env.VITE_FIREBASE_PROJECT_ID),
    /** never "" — see DEFAULT_STORAGE_BUCKET above */
    storageBucket: normaliseBucket(env.VITE_FIREBASE_STORAGE_BUCKET) || DEFAULT_STORAGE_BUCKET,
    messagingSenderId: read(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: read(env.VITE_FIREBASE_APP_ID),
    measurementId: read(env.VITE_FIREBASE_MEASUREMENT_ID),
  },
  houseId: read(env.VITE_HOUSE_ID) || "house-of-ash",
  telegramBot: read(env.VITE_TELEGRAM_BOT_USERNAME),
  telegramRelay: read(env.VITE_TELEGRAM_RELAY_URL) || "/api/telegram/send",
  vapid: read(env.VITE_VAPID_PUBLIC_KEY),
} as const;

/**
 * The single source of truth for "which bucket do we upload to?".
 * Passed explicitly to `getStorage(app, STORAGE_BUCKET)` in firebase.ts.
 */
export const STORAGE_BUCKET = CLIENT_ENV.firebase.storageBucket;

/** true when the bucket came from the fallback rather than the environment */
export const BUCKET_IS_DEFAULT = !normaliseBucket(env.VITE_FIREBASE_STORAGE_BUCKET);

/** the two values Firestore genuinely cannot start without */
const FIREBASE_REQUIRED = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID"] as const;

export function missingFirebaseVars(): string[] {
  const miss: string[] = [];
  if (!CLIENT_ENV.firebase.apiKey) miss.push("VITE_FIREBASE_API_KEY");
  if (!CLIENT_ENV.firebase.projectId) miss.push("VITE_FIREBASE_PROJECT_ID");
  return miss;
}

export const isFirebaseConfigured = () => missingFirebaseVars().length === 0;

/* ------------------------------------------------------------------ *
 *  diagnostics                                                        *
 * ------------------------------------------------------------------ */

let warned = false;

/** Logged once at boot. Actionable, and never printed twice. */
export function reportConfig() {
  if (warned) return;
  warned = true;

  const missing = missingFirebaseVars();
  const isDev = Boolean(env.DEV);

  if (missing.length) {
    console.warn(
      [
        "%c[dominion] Running in LOCAL mode — Firebase is not configured.",
        "",
        `Missing: ${missing.join(", ")}`,
        "",
        "Consequences: data stays on this device, and Telegram linking",
        "cannot complete (the webhook has nowhere to record the chat).",
        "",
        isDev
          ? "Fix: add the values to .env, then RESTART the dev server."
          : "Fix: add them in your host's Environment Variables (Vercel:" +
            " Project → Settings → Environment Variables), then REDEPLOY." +
            " VITE_ values are baked in at build time, so a redeploy is required.",
      ].join("\n"),
      "color:#c9a227;font-weight:600"
    );
  } else {
    console.info(
      `%c[dominion] Firebase connected · project ${CLIENT_ENV.firebase.projectId} · house ${CLIENT_ENV.houseId}`,
      "color:#34d399"
    );
  }

  /* The bucket is printed on every boot, because "/v0/b//o/" in the network
     tab is otherwise the only clue that it resolved to nothing. */
  console.info(
    `%c[dominion] Storage bucket · ${STORAGE_BUCKET}${BUCKET_IS_DEFAULT ? " (default — set VITE_FIREBASE_STORAGE_BUCKET to override)" : " (from VITE_FIREBASE_STORAGE_BUCKET)"}`,
    BUCKET_IS_DEFAULT ? "color:#9ca3af" : "color:#34d399"
  );

  if (!CLIENT_ENV.telegramBot) {
    console.info(
      "%c[dominion] VITE_TELEGRAM_BOT_USERNAME not set — the bot handle can be set in-app under House → Telegram bot handle (no rebuild needed).",
      "color:#9ca3af"
    );
  }
}

/** Shown in the UI when someone needs to know why linking cannot proceed. */
export function configBlockerMessage(): string | null {
  const missing = missingFirebaseVars();
  if (!missing.length) return null;
  return env.DEV
    ? `Firebase is not configured (${missing.join(", ")}). Add them to .env and restart the dev server.`
    : `Firebase is not configured on this deployment (${missing.join(", ")}). Add them in your host's environment variables and redeploy.`;
}

export { FIREBASE_REQUIRED };
