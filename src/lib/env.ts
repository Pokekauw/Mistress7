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
 *  No Storage bucket — on purpose                                     *
 *                                                                     *
 *  Firebase Storage has been dropped: it needs a paid plan, and its     *
 *  CORS preflight fails from this app's single-file build. Images are   *
 *  stored inline in Firestore instead (see src/lib/storage.ts), so      *
 *  there is no bucket to resolve, no VITE_FIREBASE_STORAGE_BUCKET to    *
 *  set, and nothing here can end up pointing at an empty one.           *
 * ------------------------------------------------------------------ */

export const CLIENT_ENV = {
  firebase: {
    apiKey: read(env.VITE_FIREBASE_API_KEY),
    authDomain: read(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: read(env.VITE_FIREBASE_PROJECT_ID),
    messagingSenderId: read(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: read(env.VITE_FIREBASE_APP_ID),
    measurementId: read(env.VITE_FIREBASE_MEASUREMENT_ID),
  },
  houseId: read(env.VITE_HOUSE_ID) || "house-of-ash",
  telegramBot: read(env.VITE_TELEGRAM_BOT_USERNAME),
  telegramRelay: read(env.VITE_TELEGRAM_RELAY_URL) || "/api/telegram/send",
  vapid: read(env.VITE_VAPID_PUBLIC_KEY),
} as const;

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

  /* Stated on every boot so nobody goes looking for a bucket that no
     longer exists: images live in Firestore, as inline data: URLs. */
  console.info(
    "%c[dominion] Media storage · inline (base64 data URLs in Firestore) — Firebase Storage is not used",
    "color:#9ca3af"
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
