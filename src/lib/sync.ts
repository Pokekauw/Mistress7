import { isFirebase, HOUSE_ID } from "../firebase";
import { applyRemoteState, getState, setCommitHook, WRITER_ID, type State } from "./store";
import { fetchHouse, mirrorCollections, primeMirror, pushHouse, watchHouse } from "./fire";
import { notifyLocal } from "./push";

export type ConnState = "local" | "connecting" | "live" | "error";
export { HOUSE_ID };

/* ------------------------------------------------------------------ */
/*  connection state                                                    */
/* ------------------------------------------------------------------ */
let conn: ConnState = isFirebase ? "connecting" : "local";
const listeners = new Set<(c: ConnState) => void>();

export const getConn = () => conn;
export const isRemote = isFirebase;

export function onConn(fn: (c: ConnState) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function setConn(c: ConnState) {
  if (conn === c) return;
  conn = c;
  listeners.forEach((f) => f(c));
}

/* ------------------------------------------------------------------ */
/*  cross-tab channel (works with and without Firebase)                 */
/* ------------------------------------------------------------------ */
let bc: BroadcastChannel | null = null;
try {
  bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("dominion") : null;
} catch {
  bc = null;
}

/* ------------------------------------------------------------------ */
/*  outbound: debounced write                                           */
/* ------------------------------------------------------------------ */
let timer: number | null = null;
let queued: State | null = null;
let booted = false;

function schedule(s: State) {
  queued = s;
  if (timer) return;
  timer = window.setTimeout(async () => {
    timer = null;
    const snap = queued;
    queued = null;
    if (!snap) return;
    const ok = await pushHouse(snap);
    setConn(ok ? "live" : "error");
    if (ok) void mirrorCollections(snap);
  }, 260);
}

/* ------------------------------------------------------------------ */
/*  inbound: notify the submissive on this device                       */
/* ------------------------------------------------------------------ */
let seen = new Set<string>();

function readSession(): { role: string | null; slaveId: string | null } {
  try {
    const raw = sessionStorage.getItem("dominion_session_v2");
    return raw ? JSON.parse(raw) : { role: null, slaveId: null };
  } catch {
    return { role: null, slaveId: null };
  }
}

function announce(next: State) {
  const me = readSession();
  const fresh = me.slaveId
    ? next.messages.filter((m) => !seen.has(m.id) && m.slaveId === me.slaveId && m.from === "mistress")
    : [];
  seen = new Set(next.messages.map((m) => m.id));
  if (!booted || !fresh.length) return;

  fresh.forEach((m) => {
    if (m.kind === "locreq") notifyLocal("📍 Location check-in demanded", "Pin your location before the window closes. ⏳");
    else if (m.kind === "decree") notifyLocal("⛓️ A decree from your Mistress", m.text);
    else if (m.kind === "demand") notifyLocal("💰 Tribute demanded", `${m.amount} is expected of you.`);
    else if (m.kind === "media")
      notifyLocal(m.media?.unlocked ? "👠 A reward from your Mistress" : "🔒 A locked teaser awaits", m.text || "");
    else if (m.kind === "text") notifyLocal("🖤 Your Mistress speaks", m.text);
  });
}

/* ------------------------------------------------------------------ */
/*  boot                                                                */
/* ------------------------------------------------------------------ */
export async function initSync() {
  /* instant cross-tab sync in every mode */
  if (bc) {
    bc.onmessage = (e) => {
      if (e.data?.from === WRITER_ID || !e.data?.state) return;
      applyRemoteState(e.data.state as State);
      announce(e.data.state as State);
    };
  }

  setCommitHook((s) => {
    try {
      bc?.postMessage({ from: WRITER_ID, state: s });
    } catch {
      /* payload too big for structured clone — localStorage still covers it */
    }
    if (isFirebase) schedule(s);
  });

  seen = new Set(getState().messages.map((m) => m.id));

  if (!isFirebase) {
    booted = true;
    setConn("local");
    return;
  }

  /* 1 — adopt the cloud house, or seed it from what we have */
  try {
    const remote = await fetchHouse();
    if (remote) {
      applyRemoteState(remote);
      primeMirror(remote);
      seen = new Set(remote.messages.map((m) => m.id));
    } else {
      const local = getState();
      primeMirror(local);
      await pushHouse(local);
      void mirrorCollections(local);
    }
    setConn("live");
  } catch {
    setConn("error");
  }

  /* 2 — listen for changes from every other device */
  watchHouse(
    (s) => {
      applyRemoteState(s);
      announce(s);
    },
    (ok) => setConn(ok ? "live" : "error")
  );

  booted = true;
}

/** force a fresh read from Firestore */
export async function pullNow() {
  const s = await fetchHouse();
  if (s) applyRemoteState(s);
}
