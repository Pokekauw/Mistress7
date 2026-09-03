/* ==================================================================== *
 *  SERVER CONFIGURATION
 *
 *  Deployment platforms differ in what they expose and how people name
 *  things. The most common production failure is a variable that exists
 *  under a slightly different name than the code expects — so every
 *  lookup here accepts several, and reports precisely what it found.
 *
 *  Nothing in this file may ever be imported by client code: it reads
 *  secrets.
 * ==================================================================== */

/** first non-empty value among the given variable names */
export function readEnv(...names: string[]): string {
  const src = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  for (const n of names) {
    const v = src[n];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export const SERVER_ENV = {
  /* ---- secrets: server only, never VITE_ prefixed ---- */
  botToken: readEnv("TELEGRAM_BOT_TOKEN", "BOT_TOKEN"),
  webhookSecret: readEnv("TELEGRAM_WEBHOOK_SECRET", "WEBHOOK_SECRET"),

  /* ---- Firebase: accept the VITE_ names too, since those are the ones
         already present in most deployments ---- */
  projectId: readEnv("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID", "GCLOUD_PROJECT"),
  apiKey: readEnv("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),

  /* ---- house ---- */
  houseId: readEnv("HOUSE_ID", "VITE_HOUSE_ID") || "house-of-ash",

  /* ---- urls ---- */
  appUrl: readEnv("APP_URL", "VITE_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL"),
  appOrigin: readEnv("APP_ORIGIN", "APP_URL", "VITE_APP_URL") || "*",
} as const;

/** Firestore REST needs both of these */
export function missingFirestoreVars(): string[] {
  const miss: string[] = [];
  if (!SERVER_ENV.projectId) miss.push("FIREBASE_PROJECT_ID");
  if (!SERVER_ENV.apiKey) miss.push("FIREBASE_API_KEY");
  return miss;
}

export const canWriteFirestore = () => missingFirestoreVars().length === 0;

/**
 * Firestore document ids and path segments must not contain slashes or
 * traversal. House ids arrive from the Telegram payload, so they are
 * untrusted input and get sanitised before they touch a URL path.
 */
export function safePathSegment(raw: string, fallback = ""): string {
  const clean = (raw || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  return clean.length >= 1 && clean.length <= 64 ? clean : fallback;
}

/** Config summary safe to expose — never includes secret values. */
export function configStatus() {
  return {
    telegramToken: SERVER_ENV.botToken ? "set" : "MISSING",
    webhookSecret: SERVER_ENV.webhookSecret ? "set" : "not set (webhook is unauthenticated)",
    firebaseProjectId: SERVER_ENV.projectId || "MISSING",
    firebaseApiKey: SERVER_ENV.apiKey ? "set" : "MISSING",
    houseId: SERVER_ENV.houseId,
    canRecordLinks: canWriteFirestore(),
  };
}
