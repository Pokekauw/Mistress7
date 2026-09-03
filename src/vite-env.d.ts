/// <reference types="vite/client" />

interface ImportMetaEnv {
  /* ---------- Firebase (public by design) ---------- */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;

  /* ---------- house ---------- */
  readonly VITE_HOUSE_ID?: string;

  /* ---------- Telegram (public values only) ----------
   * The bot TOKEN is server-side and must never appear here — any
   * VITE_ variable is compiled into the browser bundle.
   */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_TELEGRAM_RELAY_URL?: string;

  /* ---------- web push ---------- */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
