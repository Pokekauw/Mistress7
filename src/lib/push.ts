import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, HOUSE_ID, isFirebase } from "../firebase";

export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();

export type PushState = "unsupported" | "default" | "granted" | "denied";

export function pushState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushState;
}

/* ------------------------------------------------------------------ */
/*  service worker                                                      */
/* ------------------------------------------------------------------ */
let swReg: ServiceWorkerRegistration | null = null;

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register("/sw.js");
    return swReg;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  notifications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Show a notification immediately on this device.
 * Used for in-session alerts and as the fallback when no push server
 * is configured — so the experience is real even before VAPID is wired.
 */
export function notifyLocal(title: string, body: string) {
  if (pushState() !== "granted") return;
  const opts: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: "/mistress.png",
    badge: "/mistress.png",
    tag: "dominion",
    renotify: true,
    vibrate: [120, 60, 120],
  } as NotificationOptions;

  try {
    if (swReg) void swReg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  web push subscription                                               */
/* ------------------------------------------------------------------ */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Ask permission, register the SW and — when a VAPID key and Supabase are
 * configured — persist the subscription so a server can push to this device
 * even when the tab is closed.
 */
export async function enablePush(slaveId: string | null, role: "sub" | "mistress"): Promise<PushState> {
  if (pushState() === "unsupported") return "unsupported";

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm as PushState;

  const reg = swReg || (await registerSW());
  if (!reg) return "granted";

  if (!VAPID_PUBLIC_KEY || !isFirebase || !db) return "granted"; // local notifications only

  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      /* endpoint is unique per device — hash it into a stable doc id */
      const id = btoa(json.endpoint).replace(/[^a-zA-Z0-9]/g, "").slice(-64);
      await setDoc(
        doc(db, "houses", HOUSE_ID, "pushSubscriptions", id),
        {
          slaveId: slaveId ?? null,
          role,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent.slice(0, 200),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch {
    /* subscription failed — local notifications still work */
  }

  return "granted";
}
