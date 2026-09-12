import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fsCreateInvite,
  fsDeleteInvite,
  fsRedeemInvite,
  fsRevokeInvite,
  inviteStatus,
  makeToken,
  normaliseToken,
  type Invite,
} from "./invites";
import { HOUSE_ID, isFirebase } from "../firebase";
import { deleteMedia, isUploadFail, uploadImage } from "./storage";
import { canAddSlave, DEFAULT_PLAN, planHas, planOf, planRequiredFor, type Feature, type PlanId } from "./plans";
import {
  buildAlert,
  isPushKind,
  makeLinkCode,
  normaliseBotUsername,
  resolveBotUsername,
  sendTelegram,
  type AlertKind,
  type TelegramLink,
} from "./telegram";

/* ============================ types ============================ */
export type Tier = "Kneeling" | "Collared" | "Owned";

export type Slave = {
  id: string;
  name: string;
  tier: Tier;
  devotion: number;
  strikes: number;
  worships: number;
  gagUntil: number;
  lockUntil: number;
  penance: string | null;
  ltv: number;
  joinedAt: number;
  lastTouched: number;
  /**
   * Last time the SUBMISSIVE himself did anything — chat, a ritual, tribute,
   * proof, a location pin. Merely opening the app or looking at a reward does
   * NOT count. Drives the attention-debt timer (see attentionDeadline).
   */
  lastActiveAt: number;
  /** Individual attention-debt window in hours; absent = house default (12h) */
  attentionHours?: number;
  /** ritual id → timestamp of the last press that earned devotion (24h cooldown per button) */
  lastRitualAt?: Record<string, number>;
  lastSeen: number;
  hardLimits: string[];
  spendCap: number;
  spentThisMonth: number;
  tributeFrozenUntil: number;
  history: number[];
  lastFix?: Fix;
  locMisses: number;
  log?: LogEntry[];
  /* ---- presentation (Mistress may override at will) ---- */
  avatarUrl?: string; // his portrait; falls back to the house default
  chatBg?: ChatBg; // his chat backdrop; falls back to the house backdrop
  /* ---- telegram delivery ---- */
  telegram?: TelegramLink; // linked chat, once he has messaged the bot
  telegramCode?: string; // one-time code awaiting use
  lastDelivery?: { at: number; ok: boolean; kind: string }; // did the last push land?
  /* ---- ownership: set once, at redemption ---- */
  mistressId: string; // the Mistress he belongs to
  invitedBy: string; // the invitation token that admitted him
  /* ---- permanent personal key ---- */
  accessCode: string; // never changes unless she deliberately rotates it
  access: AccessState; // her switch: active · suspended · revoked
  accessNote?: string; // what he is told at the door
  accessChangedAt?: number;
};

export type AccessState = "active" | "suspended" | "revoked";

export const ACCESS_LOOK: Record<AccessState, { icon: string; label: string; tone: string }> = {
  active: { icon: "🗝️", label: "Active", tone: "emerald" },
  suspended: { icon: "⏸️", label: "Suspended", tone: "amber" },
  revoked: { icon: "⛔", label: "Revoked", tone: "rose" },
};

export type LogEntry = {
  id: string;
  at: number;
  icon: string;
  label: string;
  detail: string;
  devotion: number; // signed delta
  kind: "strike" | "wheel" | "condition" | "proof" | "status";
};

export type MsgKind =
  | "text"
  | "decree"
  | "tribute"
  | "demand"
  | "system"
  | "refusal"
  | "proof"
  | "locreq"
  | "location"
  | "media";

export type LockKind = "free" | "tribute" | "devotion";

export type Media = {
  url: string;
  path: string | null;
  mime: string;
  name: string;
  preview: string | null; // blurred tease shown while locked
  lock: LockKind;
  price?: number; // tribute lock
  need?: number; // devotion lock
  unlocked: boolean;
  views: number;
  burn: boolean; // vanishes after first view
  burned?: boolean;
};

export type Fix = { lat: number; lng: number; acc: number; at: number; place?: string };

export type Msg = {
  id: string;
  slaveId: string;
  from: "mistress" | "sub" | "system";
  kind: MsgKind;
  /** header line, e.g. "Mistress Strikes" — rendered as "Mistress Strikes: {name}" on her deck */
  title?: string;
  text: string;
  amount?: number;
  status?: "pending" | "paid" | "declined";
  /** a tribute offer (kind === "tribute") offered against this demand message id */
  demandId?: string;
  /** proof attachment — `url` is a Storage link, never raw file bytes */
  file?: { name: string; url: string | null; mime: string; size: number; path?: string | null };
  verdict?: "pending" | "accepted" | "rejected";
  /* location */
  deadline?: number;
  locState?: "pending" | "fulfilled" | "expired";
  fix?: Fix;
  reqId?: string;
  media?: Media;
  time: number;
  /**
   * The moment the RECIPIENT actually opened the thread and saw this line.
   * Absent = sent (✓), stamped = seen/read (✓✓). Only ever written by the
   * party that did not send it.
   */
  readAt?: number;
  /** a ritual performed on repeat: how many presses this line folds together */
  repeat?: number;
  /** ritual meta, so both sides can show "+4 ♥" or "already earned today" */
  ritual?: { id: string; earned: boolean; dev: number };
};

export type { Invite } from "./invites";

/** a chat backdrop: either a colour wash or an image */
export type ChatBg = {
  kind: "preset" | "image";
  /** preset id, or an image URL / data URL */
  value: string;
};

export const BG_PRESETS: { id: string; label: string; css: string; swatch: string }[] = [
  { id: "obsidian", label: "Obsidian", css: "linear-gradient(160deg,#120d13,#0a070b)", swatch: "#120d13" },
  { id: "oxblood", label: "Oxblood", css: "linear-gradient(160deg,#2a0c17,#0a070b)", swatch: "#4a1224" },
  { id: "plum", label: "Plum", css: "linear-gradient(160deg,#231038,#0a070b)", swatch: "#2f1550" },
  { id: "brass", label: "Brass", css: "linear-gradient(160deg,#241d0c,#0a070b)", swatch: "#4a3410" },
  { id: "slate", label: "Slate", css: "linear-gradient(160deg,#141a1f,#080a0c)", swatch: "#1d2830" },
  { id: "void", label: "Void", css: "linear-gradient(160deg,#000,#000)", swatch: "#000000" },
];

export const DEFAULT_BG: ChatBg = { kind: "preset", value: "obsidian" };

/** resolve a backdrop to inline CSS */
export function bgStyle(bg?: ChatBg | null): React.CSSProperties {
  const b = bg || DEFAULT_BG;
  if (b.kind === "image" && b.value)
    return {
      backgroundImage: `linear-gradient(rgba(8,6,10,.72),rgba(8,6,10,.86)), url("${b.value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  const p = BG_PRESETS.find((x) => x.id === b.value) || BG_PRESETS[0];
  return { backgroundImage: p.css };
}

export type Dungeon = {
  name: string;
  honorific: string;
  sigil: string;
  entryRite: string;
  rules: string[];
  prices: Record<Tier, number>;
  configured: boolean;
  /** active subscription — gates roster size and advanced features */
  plan?: PlanId;
  /** Telegram bot handle for this house; overrides VITE_TELEGRAM_BOT_USERNAME */
  telegramBot?: string;
  /** her own portrait — URL or data URL. Empty falls back to the bundled crest. */
  avatarUrl?: string;
  /** default portrait applied to any submissive without one of his own */
  slaveAvatarUrl?: string;
  /** house-wide chat backdrop; a slave may override it */
  chatBg?: ChatBg;
};

/** a live "he is writing / she is writing" heartbeat, one per party */
export type TypingBeat = { sub?: number | null; mistress?: number | null };

export type State = {
  dungeon: Dungeon;
  slaves: Slave[];
  messages: Msg[];
  invites: Invite[];
  events: { id: string; text: string; tone: "gold" | "red" | "green" | "muted"; time: number }[];
  /** typing heartbeats, keyed by slaveId — expires on its own, see TYPING_TTL_MS */
  typing?: Record<string, TypingBeat>;
  /** when the Mistress's deck was last open — he is shown "last seen …" */
  mistressSeenAt?: number;
};

export type Session = { role: "mistress" | "sub" | null; slaveId: string | null };

/* ============================ constants ============================ */
const KEY = "dominion_state_v2";
const SKEY = "dominion_session_v2";

export const RANKS: [number, string][] = [
  [0, "Pathetic Worm"],
  [15, "Obedient Pet"],
  [35, "Devoted Slave"],
  [60, "Kept Property"],
  [85, "Owned Entirely"],
];

export const HARD_LIMIT_OPTIONS = [
  "real-world exposure",
  "financial ruin",
  "permanent marks",
  "third parties",
  "location tracking",
];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const rnd = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

export function rankOf(d: number) {
  let r = RANKS[0][1];
  RANKS.forEach(([n, t]) => {
    if (d >= n) r = t;
  });
  return r;
}

export function timeLeft(ms: number) {
  if (ms <= 0) return "";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

export const isGagged = (s: Slave) => s.gagUntil > Date.now();
export const isLocked = (s: Slave) => s.lockUntil > Date.now();

/* ===================== attention debt timer ⏳ ===================== */
/** Default silence window before devotion is taken automatically */
export const DEFAULT_ATTENTION_HOURS = 12;
/** devotion removed every time an attention-debt window expires in silence */
export const ATTENTION_PENALTY = 10;
/** a ritual button earns its devotion at most once per rolling 24h */
export const RITUAL_COOLDOWN_MS = 24 * 3600 * 1000;
/** repeating the same ritual inside this window folds into one chat line */
export const RITUAL_MERGE_MS = 90 * 1000;

/* ===================== presence · typing · read ===================== */
/** a "…is writing" flag stays up this long after the last keystroke */
export const TYPING_TTL_MS = 6000;
/** how often a party may rewrite its own heartbeat (keeps writes cheap) */
const TYPING_THROTTLE_MS = 2200;
/** how often a party may rewrite "last seen" */
const PRESENCE_THROTTLE_MS = 45_000;

const beatAt: Record<string, number> = {};

/**
 * He is writing / she is writing. Called on every keystroke but only writes to
 * the store once every couple of seconds — a Firestore write per letter would
 * be absurd, and the flag lapses on its own anyway (TYPING_TTL_MS).
 */
export function setTyping(slaveId: string, who: "sub" | "mistress", on: boolean) {
  const key = `${who}:${slaveId}`;
  const now = Date.now();
  const current = state.typing?.[slaveId]?.[who] ?? 0;

  if (on) {
    if (now - (beatAt[key] || 0) < TYPING_THROTTLE_MS) return;
    beatAt[key] = now;
  } else {
    if (!current) return; // already quiet — never write for nothing
    delete beatAt[key];
  }

  update((s) => ({
    ...s,
    typing: { ...(s.typing || {}), [slaveId]: { ...(s.typing?.[slaveId] || {}), [who]: on ? now : null } },
  }));
}

/** is the other party mid-sentence right now? */
export function isTyping(s: State, slaveId: string, who: "sub" | "mistress") {
  const at = s.typing?.[slaveId]?.[who];
  return typeof at === "number" && Date.now() - at < TYPING_TTL_MS;
}

/**
 * The Mistress's deck pings this while it is open, so he can see that she is
 * about. Throttled: at most one write every 45 s.
 */
export function touchMistressPresence(force = false) {
  const now = Date.now();
  const last = state.mistressSeenAt || 0;
  if (!force && now - last < PRESENCE_THROTTLE_MS) return;
  if (document.visibilityState === "hidden") return;
  update((s) => ({ ...s, mistressSeenAt: now }));
}

/** His app pings this while it is open — drives "last seen" on her deck. */
export function touchSubPresence(slaveId: string, force = false) {
  const s = getSlave(slaveId);
  if (!s) return;
  const now = Date.now();
  if (!force && now - (s.lastSeen || 0) < PRESENCE_THROTTLE_MS) return;
  if (document.visibilityState === "hidden") return;
  update((st) => mapSlave(st, slaveId, (x) => ({ ...x, lastSeen: now })));
}

/**
 * Stamp every line the OTHER party sent as read. Called when a thread is on
 * screen and the document is actually visible — reading is a deliberate act,
 * not something a background tab does. Writes only when something is unstamped.
 */
export function markThreadRead(slaveId: string, reader: "sub" | "mistress") {
  if (document.visibilityState === "hidden") return;
  const sender = reader === "sub" ? "mistress" : "sub";
  const now = Date.now();
  const pending = state.messages.some(
    (m) => m.slaveId === slaveId && m.from === sender && !m.readAt
  );
  if (!pending) return;
  update((s) => ({
    ...s,
    messages: s.messages.map((m) =>
      m.slaveId === slaveId && m.from === sender && !m.readAt ? { ...m, readAt: now } : m
    ),
  }));
}

/** "21:04" — the short stamp under a bubble */
export function clockOf(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "12 Sep 21:04" for anything older than today, else just the clock */
export function stampOf(t: number) {
  const d = new Date(t);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  return sameDay ? clockOf(t) : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${clockOf(t)}`;
}

/** "just now" · "4m ago" · "3h ago" · "2d ago" */
export function seenAgo(t?: number | null) {
  if (!t) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export const attentionWindowMs = (s: Slave) =>
  (s.attentionHours && s.attentionHours > 0 ? s.attentionHours : DEFAULT_ATTENTION_HOURS) * 3600_000;

/** the moment the timer is counting from — only the submissive's own activity moves it */
export const attentionAnchor = (s: Slave) => s.lastActiveAt ?? s.lastTouched ?? s.joinedAt ?? Date.now();

/** when the current attention-debt window comes due */
export function attentionDeadline(s: Slave) {
  return attentionAnchor(s) + attentionWindowMs(s);
}

/** 0–100 % of the current window already spent in silence */
export function attentionDebt(s: Slave) {
  const elapsed = Date.now() - attentionAnchor(s);
  return Math.max(0, Math.min(100, Math.round((elapsed / attentionWindowMs(s)) * 100)));
}

/** daily ritual cooldown: has this button earned its devotion today? */
export function ritualState(s: Slave, ritualId: string) {
  const resetsAt = (s.lastRitualAt?.[ritualId] || 0) + RITUAL_COOLDOWN_MS;
  return { earned: resetsAt <= Date.now(), resetsAt };
}

export function money(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

export function fmtMins(m: number) {
  if (m < 60) return `${m} minutes`;
  const h = m / 60;
  if (h < 24) return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} day${h / 24 === 1 ? "" : "s"}`;
}

/* ============================ seed ============================ */
function mkSlave(p: Partial<Slave> & { name: string }): Slave {
  return {
    id: uid(),
    tier: "Collared",
    devotion: 40,
    strikes: 0,
    worships: 0,
    gagUntil: 0,
    lockUntil: 0,
    penance: null,
    ltv: 0,
    joinedAt: Date.now(),
    lastTouched: Date.now(),
    lastActiveAt: Date.now(),
    lastRitualAt: {},
    lastSeen: Date.now(),
    hardLimits: ["real-world exposure"],
    spendCap: 1500,
    spentThisMonth: 0,
    tributeFrozenUntil: 0,
    history: [30, 34, 38, 40, 42, 44, 40],
    locMisses: 0,
    mistressId: HOUSE_ID,
    invitedBy: "",
    accessCode: makeAccessCode(),
    access: "active",
    accessChangedAt: Date.now(),
    ...p,
  };
}

/* ---------------- permanent personal codes ---------------- */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

/** e.g. ASH-7K2Q — belongs to one submissive for life */
export function makeAccessCode(): string {
  const pick4 = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  let taken: string[] = [];
  try {
    taken = state.slaves.map((s) => s.accessCode); // guarded: `state` may still be initialising
  } catch {
    taken = [];
  }
  let code = "";
  do {
    code = `${pick4().slice(0, 3)}-${pick4()}`;
  } while (taken.includes(code));
  return code;
}

export const normaliseCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

function seed(): State {
  /* A clean house. Nobody enters except by invitation. */
  return {
    dungeon: {
      name: "House of Ash",
      honorific: "Mistress",
      sigil: "✦",
      entryRite: "You enter on your knees. You address me correctly, or you do not address me at all.",
      rules: [
        "You will address me as Mistress at all times",
        "You will respond within two hours",
        "You will check in daily at 21:00",
        "You will make requests, never demands",
      ],
      prices: { Kneeling: 40, Collared: 150, Owned: 500 },
      configured: true,
      plan: DEFAULT_PLAN,
    },
    slaves: [],
    messages: [],
    invites: [],
    events: [],
  };
}

/* ============================ store ============================ */
/** back-fill fields added after a house was first created */
export function normaliseState(s: State): State {
  const used = new Set<string>();
  /* migrate: legacy houses carried a `keys` array; invitations replace it */
  const legacy = (s as unknown as { keys?: unknown[] }).keys;
  const invites = Array.isArray(s.invites) ? s.invites : [];
  if (legacy) delete (s as unknown as { keys?: unknown[] }).keys;

  return {
    ...s,
    invites,
    /* presence & typing: Firestore's undefined→null cleaning can leave stray
       nulls behind, and a stale writer may leave a very old heartbeat */
    typing: s.typing || {},
    dungeon: { ...s.dungeon, plan: s.dungeon?.plan ?? DEFAULT_PLAN },
    messages: (s.messages || []).map((m) => ({
      ...m,
      readAt: typeof m.readAt === "number" ? m.readAt : undefined,
    })),
    slaves: (s.slaves || []).map((x) => {
      let code = x.accessCode;
      if (!code || used.has(code)) {
        const pick4 = () =>
          Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
        do {
          code = `${pick4().slice(0, 3)}-${pick4()}`;
        } while (used.has(code));
      }
      used.add(code);
      return {
        ...x,
        accessCode: code,
        access: x.access || "active",
        accessChangedAt: x.accessChangedAt || x.joinedAt || Date.now(),
        log: x.log || [],
        mistressId: x.mistressId || HOUSE_ID,
        invitedBy: x.invitedBy || "",
        /* attention-debt timer: adopt the old lastTouched as its first anchor */
        lastActiveAt: x.lastActiveAt ?? x.lastTouched ?? x.joinedAt ?? Date.now(),
        lastRitualAt: x.lastRitualAt || {},
      };
    }),
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normaliseState(JSON.parse(raw) as State);
  } catch {
    /* ignore */
  }
  return seed();
}

let state: State = load();
const listeners = new Set<() => void>();

/* persist the seed immediately so a second tab adopts the same world */
try {
  if (typeof localStorage !== "undefined" && !localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
} catch {
  /* ignore */
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

/** unique id for this browser tab — lets the sync layer ignore its own echo */
export const WRITER_ID = uid();

type CommitHook = (s: State) => void;
let commitHook: CommitHook | null = null;
export function setCommitHook(h: CommitHook | null) {
  commitHook = h;
}

export function update(fn: (s: State) => State) {
  state = fn(state);
  persist();
  emit();
  try {
    commitHook?.(state);
  } catch {
    /* never let sync break the UI */
  }
}

/** applied when Firestore tells us another device changed the house */
export function applyRemoteState(next: State) {
  state = normaliseState(next);
  persist();
  emit();
}

export const getState = () => state;

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      emit();
    }
  });
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => sel(state),
    () => sel(state)
  );
}

/** re-render on an interval so countdowns tick; also expires overdue check-ins */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      sweepLocationRequests();
      sweepAttentionDebt();
      set((n) => n + 1);
    }, ms);
    /* run once on mount, too — a debt may already be due when the app opens */
    sweepLocationRequests();
    sweepAttentionDebt();
    return () => clearInterval(t);
  }, [ms]);
}

export function resetAll() {
  state = seed();
  persist();
  emit();
  try {
    commitHook?.(state);
  } catch {
    /* ignore */
  }
}

/* ============================ session ============================ */
export function getSession(): Session {
  try {
    const raw = sessionStorage.getItem(SKEY);
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* ignore */
  }
  return { role: null, slaveId: null };
}

export function setSession(s: Session) {
  try {
    sessionStorage.setItem(SKEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* ============================ helpers ============================ */
function pushMsg(s: State, m: Omit<Msg, "id" | "time">): State {
  return { ...s, messages: [...s.messages, { ...m, id: uid(), time: Date.now() }] };
}

function pushEvent(s: State, text: string, tone: "gold" | "red" | "green" | "muted"): State {
  return { ...s, events: [{ id: uid(), text, tone, time: Date.now() }, ...s.events].slice(0, 40) };
}

function mapSlave(s: State, id: string, fn: (x: Slave) => Slave): State {
  return { ...s, slaves: s.slaves.map((x) => (x.id === id ? fn(x) : x)) };
}

/**
 * Stamp genuine submissive activity — a message, a ritual, tribute, proof, a
 * location pin. This is the ONLY thing that winds the attention-debt timer
 * back. Opening the app, signing in or merely looking at a reward must not
 * go through here.
 */
const touchActivity = (x: Slave): Slave => {
  const now = Date.now();
  return { ...x, lastActiveAt: now, lastTouched: now };
};

export function getSlave(id: string | null) {
  return state.slaves.find((s) => s.id === id) ?? null;
}

export function messagesFor(s: State, id: string) {
  return s.messages.filter((m) => m.slaveId === id).sort((a, b) => a.time - b.time);
}

/* ============================ commands (mistress) ============================ */
export type CommandId =
  | "gag"
  | "lock"
  | "strike"
  | "penance"
  | "expose"
  | "tribute"
  | "decree"
  | "locate"
  | "praise"
  | "promote"
  | "mercy";

export const COMMANDS: {
  id: CommandId;
  label: string;
  icon: string;
  tone: "punish" | "control" | "reward";
  limit?: string;
  needsInput?: "amount" | "text" | "duration";
  requiresProof?: boolean;
}[] = [
  { id: "gag", label: "Gag", icon: "🤐", tone: "control", needsInput: "duration" },
  { id: "lock", label: "Chastity", icon: "🔒", tone: "control", needsInput: "duration" },
  { id: "strike", label: "Strike", icon: "💥", tone: "punish" },
  { id: "penance", label: "Penance", icon: "⛓️", tone: "punish", needsInput: "text", requiresProof: true },
  { id: "expose", label: "Expose", icon: "👁️", tone: "punish", limit: "real-world exposure" },
  { id: "tribute", label: "Tribute", icon: "💰", tone: "control", needsInput: "amount" },
  { id: "decree", label: "Decree", icon: "📜", tone: "control", needsInput: "text" },
  { id: "locate", label: "Check-in", icon: "📍", tone: "control", needsInput: "duration", limit: "location tracking" },
  { id: "praise", label: "Praise", icon: "🖤", tone: "reward" },
  { id: "promote", label: "Promote", icon: "👑", tone: "reward" },
  { id: "mercy", label: "Mercy", icon: "🕊️", tone: "reward" },
];

/** shorter windows make sense for a location check-in */
export const CHECKIN_WINDOWS = [
  { label: "5 min", m: 5 },
  { label: "15 min", m: 15 },
  { label: "30 min", m: 30 },
  { label: "1 hr", m: 60 },
  { label: "2 hrs", m: 120 },
  { label: "4 hrs", m: 240 },
];

/** quick-fill libraries so she never faces a blank box */
export const PENANCE_PRESETS = [
  "Write two hundred lines: “I exist to serve.” 📝",
  "Kneel facing the corner for twenty minutes. ⛓️",
  "Polish every pair of boots in this house. 👢",
  "Take a cold shower, then photograph yourself. 🚿",
  "No screens for three hours. Report to me afterwards. 📵",
];

export const DECREE_PRESETS = [
  "Kneel, and do not move until I permit it. 🖤",
  "You will address me correctly, or not at all. 👑",
  "Present yourself to me at 21:00. Do not be late. ⏳",
  "Thank me for the discipline you received today. ⛓️",
  "You will not speak until you are spoken to. 🤐",
];

export const DURATIONS = [
  { label: "10 min", m: 10 },
  { label: "30 min", m: 30 },
  { label: "1 hr", m: 60 },
  { label: "4 hrs", m: 240 },
  { label: "12 hrs", m: 720 },
  { label: "24 hrs", m: 1440 },
];

const NEXT_TIER: Record<Tier, Tier> = { Kneeling: "Collared", Collared: "Owned", Owned: "Owned" };

export type FireResult = {
  ok: number;
  refused: { name: string; why: string }[];
  /** issued, but it did not reach his phone */
  undelivered: { name: string; why: Delivery }[];
};

export function fireCommand(cmd: CommandId, ids: string[], arg?: string | number): FireResult {
  const result: FireResult = { ok: 0, refused: [], undelivered: [] };
  const def = COMMANDS.find((c) => c.id === cmd)!;
  /** queued alerts — dispatched only after the state has committed */
  const outbound: { id: string; kind: AlertKind; body: string }[] = [];

  /* subscription gate — enforced here, not merely hidden in the UI */
  const FEATURE_GATE: Partial<Record<CommandId, Feature>> = { locate: "location" };
  const gate = FEATURE_GATE[cmd];
  if (gate && !has(gate)) {
    const need = planRequiredFor(gate).name;
    update((s) => pushEvent(s, `🔒 ${def.label} requires the ${need} plan`, "muted"));
    return {
      ok: 0,
      undelivered: [],
      refused: ids.map((id) => ({
        name: getSlave(id)?.name || "unknown",
        why: `requires the ${need} plan`,
      })),
    };
  }

  update((s) => {
    let next = s;
    ids.forEach((id) => {
      const slave = next.slaves.find((x) => x.id === id);
      if (!slave) return;

      /* --- limits registry: the engine refuses the Mistress --- */
      if (def.limit && slave.hardLimits.includes(def.limit)) {
        result.refused.push({ name: slave.name, why: `hard limit "${def.limit}"` });
        next = pushMsg(next, {
          slaveId: id,
          from: "system",
          kind: "refusal",
          text: `Refused. Hard limit "${def.limit}" registered at collaring. Logged · not delivered.`,
        });
        return;
      }

      /* --- spend cap guard --- */
      if (cmd === "tribute") {
        const amt = Number(arg) || 0;
        if (slave.tributeFrozenUntil > Date.now()) {
          result.refused.push({ name: slave.name, why: "tribute frozen after safeword" });
          return;
        }
        if (slave.spentThisMonth + amt > slave.spendCap) {
          result.refused.push({ name: slave.name, why: `spend cap ${money(slave.spendCap)}` });
          next = pushMsg(next, {
            slaveId: id,
            from: "system",
            kind: "refusal",
            text: `Refused. Self-imposed spend cap of ${money(slave.spendCap)} reached this month.`,
          });
          return;
        }
      }

      result.ok += 1;
      const touch = (x: Slave): Slave => ({ ...x, lastTouched: Date.now() });

      /* ── PUSH POLICY ──
       * Kun når Mistress trykker en handlingsknap: Decree, Check-in og Send Media
       * ellers ingen push. Se telegram.ts PUSH_KINDS.
       *
       * 📜 Decree       → ✅ push med lyd
       * 📍 Check-in     → ✅ push med lyd
       * 👠 Send Media   → ✅ push med lyd (i sendMedia())
       * ✍️ Chat, ⚖️ Verdict, ⏳ auto-straf, ⛓️ penance/tribute/gag/lock/strike/mercy → ❌ kun i appen
       */
      const ALERT: Partial<Record<CommandId, AlertKind>> = {
        decree: "decree",
        locate: "checkin",
      };
      const kind = ALERT[cmd];
      if (kind) {
        const body =
          cmd === "decree"
            ? String(arg || "See your standing.")
            : `Confirm your location within ${fmtMins(Number(arg) || 15)}.`;
        outbound.push({ id, kind, body });
      }

      switch (cmd) {
        case "gag": {
          const mins = Number(arg) || 10;
          next = mapSlave(next, id, (x) => touch({ ...x, gagUntil: Date.now() + mins * 60000 }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mistress Gags",
            text: `You are silenced for ${fmtMins(mins)}. Do not attempt to speak.`,
          });
          break;
        }
        case "lock": {
          const mins = Number(arg) || 60;
          next = mapSlave(next, id, (x) => touch({ ...x, lockUntil: Date.now() + mins * 60000 }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mistress Locks",
            text: `You are held in chastity for ${fmtMins(mins)}. The key is hers alone.`,
          });
          break;
        }
        case "strike":
          next = mapSlave(next, id, (x) => touch({ ...x, strikes: x.strikes + 1, devotion: Math.max(0, x.devotion - 3) }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mistress Strikes",
            text: "A strike is entered against your record. Do not earn another.",
          });
          break;
        case "penance":
          next = mapSlave(next, id, (x) => touch({ ...x, penance: String(arg || "Write two hundred lines of gratitude.") }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Penance Assigned",
            text: String(arg || "Write two hundred lines of gratitude."),
          });
          break;
        case "expose":
          next = mapSlave(next, id, (x) => touch({ ...x, strikes: x.strikes + 1 }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mistress Exposes",
            text: "You are no longer permitted your dignity. Others will see you as she does.",
          });
          break;
        case "tribute": {
          const amt = Number(arg) || 150;
          next = mapSlave(next, id, touch);
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "demand",
            title: "Tribute Demanded",
            text: "Payment is expected without discussion.",
            amount: amt,
            status: "pending",
          });
          break;
        }
        case "decree":
          next = mapSlave(next, id, touch);
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Decree Issued",
            text: String(arg || "Kneel, and do not move until permitted."),
          });
          break;
        case "locate": {
          const mins = Number(arg) || 15;
          next = mapSlave(next, id, touch);
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "locreq",
            title: "Check-In Demanded",
            text: `Confirm your location within ${fmtMins(mins)}.`,
            deadline: Date.now() + mins * 60000,
            locState: "pending",
          });
          break;
        }
        case "praise":
          next = mapSlave(next, id, (x) => touch({ ...x, devotion: Math.min(100, x.devotion + rnd(4, 8)) }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mistress Approves",
            text: "You have pleased her. Remember how rare this is.",
          });
          break;
        case "promote":
          next = mapSlave(next, id, (x) => touch({ ...x, tier: NEXT_TIER[x.tier], devotion: Math.min(100, x.devotion + 6) }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Collar Raised",
            text: "Your standing in this house has risen. See that you keep it.",
          });
          break;
        case "mercy":
          next = mapSlave(next, id, (x) => touch({ ...x, strikes: 0, gagUntil: 0, lockUntil: 0, penance: null }));
          next = pushMsg(next, {
            slaveId: id,
            from: "mistress",
            kind: "decree",
            title: "Mercy Granted",
            text: "Every condition is lifted and your record is cleared. Be grateful.",
          });
          break;
      }
    });

    const label = def.label;
    if (result.ok)
      next = pushEvent(
        next,
        `${def.icon} ${label} issued to ${result.ok} ${result.ok === 1 ? "submissive" : "submissives"}`,
        "gold"
      );
    result.refused.forEach((r) => {
      next = pushEvent(next, `⛔ ${label} refused for ${r.name} — ${r.why}`, "red");
    });
    return next;
  });

  /* deliver once the state is settled, and report how each order travelled */
  outbound.forEach((o) => {
    const d = notifySlave(o.id, o.kind, o.body);
    if (d !== "sent" && d !== "skipped") result.undelivered.push({ name: getSlave(o.id)?.name || "unknown", why: d });
  });

  return result;
}

/**
 * ✍️ Almindelig chatbesked — ❌ Nej — ses kun i appen
 * Per push policy: aldrig Telegram, kun i appen.
 */
export function sendMistressText(slaveId: string, text: string) {
  update((s) => mapSlave(pushMsg(s, { slaveId, from: "mistress", kind: "text", text }), slaveId, (x) => ({ ...x, lastTouched: Date.now() })));
}

/* ============================ invitations ⛓️ ============================
 * The one and only way into this house. Generated by the Mistress,
 * redeemed exactly once, then dead.
 * ====================================================================== */

/** stable identity for the owner of this house */
export const MISTRESS_ID = HOUSE_ID;

export function generateInvite(opts: { tier: Tier; boundName?: string; ttlHours: number }): Invite {
  const inv: Invite = {
    key: makeToken(),
    mistressId: MISTRESS_ID,
    createdAt: Date.now(),
    expiresAt: opts.ttlHours > 0 ? Date.now() + opts.ttlHours * 3600 * 1000 : null,
    used: false,
    usedBy: null,
    usedAt: null,
    tier: opts.tier,
    boundName: (opts.boundName || "").trim(),
    revoked: false,
  };
  update((s) => pushEvent({ ...s, invites: [inv, ...s.invites] }, `⛓️ Invitation Generated: ${inv.key} · ${inv.tier}`, "gold"));
  void fsCreateInvite(inv);
  return inv;
}

export function revokeInvite(token: string) {
  update((s) => {
    const next = { ...s, invites: s.invites.map((i) => (i.key === token ? { ...i, revoked: true } : i)) };
    return pushEvent(next, `⛔ Invitation Revoked: ${token}`, "red");
  });
  void fsRevokeInvite(token);
}

export function deleteInvite(token: string) {
  update((s) => ({ ...s, invites: s.invites.filter((i) => i.key !== token) }));
  void fsDeleteInvite(token);
}

const REDEEM_ERROR: Record<string, string> = {
  missing: "That invitation does not exist. The door does not open. 🖤",
  used: "This invitation has already been redeemed. It cannot be used twice.",
  revoked: "This invitation was withdrawn by the Mistress before you arrived.",
  expired: "This invitation has expired. You were too slow. ⏳",
  bound: "This invitation was issued to someone else.",
  denied: "The house refused the request. Firestore rules are blocking access — see SETUP.md.",
  error: "The house could not be reached. Check your connection and try again.",
};

/**
 * Redeem an invitation and collar the bearer.
 * Firestore claims the token in a transaction first, so two people
 * racing on the same link cannot both get in.
 */
export async function redeemInvite(
  input: string,
  name: string
): Promise<{ ok: boolean; slaveId?: string; accessCode?: string; error?: string }> {
  const token = normaliseToken(input);
  if (!token) return { ok: false, error: "Enter your invitation key." };
  if (!name.trim()) return { ok: false, error: "You must give a name." };

  /* subscription gate — her plan decides how many she may hold */
  const cap = rosterCapacity();
  if (!cap.ok)
    return {
      ok: false,
      error: `This house is full. Her plan admits ${cap.max} submissives, and all are taken. 🖤`,
    };

  const local = state.invites.find((i) => normaliseToken(i.key) === token);

  /* Validate locally first — the synced house document is authoritative for
     the UI, so a token visible under Invitations must always be redeemable. */
  if (local) {
    const status = inviteStatus(local);
    if (status !== "open") return { ok: false, error: REDEEM_ERROR[status] };
    if (local.boundName && local.boundName.toLowerCase() !== name.trim().toLowerCase())
      return { ok: false, error: REDEEM_ERROR.bound };
  }

  /* The slave id is minted up front so Firestore records the real holder
     in `usedBy` rather than a throwaway id. */
  const tier: Tier = local?.tier || "Kneeling";
  const s = mkSlave({
    name: name.trim(),
    tier,
    devotion: 5,
    ltv: 0,
    history: [0, 1, 2, 3, 4, 4, 5],
    lastTouched: Date.now(),
    /* ownership is established here and nowhere else */
    mistressId: local?.mistressId || MISTRESS_ID,
    invitedBy: token,
  });

  /* Claim the token atomically so two people racing the same link
     cannot both get in. */
  if (isFirebase) {
    const res = await fsRedeemInvite(token, s.id, name);
    if (!res.ok) {
      /* `denied` and `error` mean the database could not answer — never
         report that as a bad token when we can see it locally. */
      if (res.reason === "denied" || res.reason === "error") {
        if (!local) return { ok: false, error: REDEEM_ERROR[res.reason] };
      } else if (res.reason === "missing") {
        if (!local) return { ok: false, error: REDEEM_ERROR.missing };
      } else {
        return { ok: false, error: REDEEM_ERROR[res.reason] };
      }
    }
  } else if (!local) {
    return { ok: false, error: REDEEM_ERROR.missing };
  }

  update((st) => {
    let next: State = {
      ...st,
      slaves: [...st.slaves, s],
      invites: st.invites.map((i) =>
        normaliseToken(i.key) === token ? { ...i, used: true, usedBy: s.id, usedAt: Date.now() } : i
      ),
    };
    next = pushMsg(next, { slaveId: s.id, from: "system", kind: "system", text: st.dungeon.entryRite });
    next = pushMsg(next, {
      slaveId: s.id,
      from: "system",
      kind: "system",
      text: `🗝️ Your permanent code is ${s.accessCode}. Present it each time you return. It may be withdrawn at your Mistress's discretion.`,
    });
    return pushEvent(next, `⛓️ Collared: ${s.name} · ${tier} · invitation ${token}`, "green");
  });

  return { ok: true, slaveId: s.id, accessCode: s.accessCode };
}

/* ============================ permanent access 🗝️ ============================ */

export const ACCESS_DENIED: Record<Exclude<AccessState, "active">, string> = {
  suspended: "⏸️ Your access has been suspended. Your code remains yours; your Mistress decides when it will open again.",
  revoked: "⛔ Your key has been withdrawn. You are not permitted in this house.",
};

/**
 * What is this token? Lets the gate route correctly instead of guessing
 * from a toggle the visitor may not have touched.
 */
export function identifyToken(input: string): "code" | "invite" | "unknown" {
  const t = normaliseToken(input);
  if (!t) return "unknown";
  if (state.slaves.some((s) => normaliseCode(s.accessCode) === t)) return "code";
  if (state.invites.some((i) => normaliseToken(i.key) === t)) return "invite";
  return "unknown";
}

/**
 * The single entry point for a submissive. Works out on its own whether the
 * string is a permanent personal code or an invitation token, so an
 * invitation can never be mistaken for a bad sign-in.
 */
export async function enterHouse(
  input: string,
  name: string
): Promise<{ ok: boolean; slaveId?: string; accessCode?: string; isNew?: boolean; needName?: boolean; error?: string }> {
  const token = normaliseToken(input);
  if (!token) return { ok: false, error: "Enter your code or invitation key." };

  const kind = identifyToken(token);

  if (kind === "code") {
    const r = signInWithCode(token);
    return { ...r, isNew: false };
  }

  if (kind === "invite" && !name.trim()) {
    return { ok: false, needName: true, error: "This is an invitation. Give the name you will be known by." };
  }

  /* Unknown locally: it may still be a valid invitation held only in
     Firestore, so try to redeem before refusing. */
  if (kind === "unknown" && !name.trim()) {
    if (!isFirebase) return { ok: false, error: REDEEM_ERROR.missing };
    return { ok: false, needName: true, error: "If this is an invitation, give the name you will be known by." };
  }

  const r = await redeemInvite(token, name);
  return { ...r, isNew: r.ok };
}

/** a returning submissive signs in with his permanent personal code */
export function signInWithCode(input: string): { ok: boolean; slaveId?: string; error?: string } {
  const code = normaliseCode(input);
  if (!code) return { ok: false, error: "Enter your code." };

  const slave = state.slaves.find((s) => normaliseCode(s.accessCode) === code);
  if (!slave) return { ok: false, error: "No such code. The door does not open. 🖤" };

  if (slave.access !== "active") {
    return { ok: false, error: slave.accessNote?.trim() || ACCESS_DENIED[slave.access] };
  }

  update((s) => mapSlave(s, slave.id, (x) => ({ ...x, lastSeen: Date.now() })));
  return { ok: true, slaveId: slave.id };
}

/** Mistress takes the key away — or gives it back. The code itself is untouched. */
export function setAccess(slaveId: string, access: AccessState, note?: string) {
  update((s) => {
    const prev = s.slaves.find((x) => x.id === slaveId);
    if (!prev || prev.access === access) return s;

    const look = ACCESS_LOOK[access];
    let next = mapSlave(s, slaveId, (x) =>
      addLog(
        {
          ...x,
          access,
          accessNote: note?.trim() || undefined,
          accessChangedAt: Date.now(),
          lastTouched: Date.now(),
          /* locking him out also silences every live condition */
          ...(access === "revoked" ? { gagUntil: 0, lockUntil: 0 } : {}),
        },
        {
          icon: look.icon,
          label:
            access === "active" ? "Access Restored" : access === "suspended" ? "Access Suspended" : "Key Withdrawn",
          detail: note?.trim() || (access === "active" ? "Restored by Mistress" : "Withdrawn by Mistress"),
          devotion: 0,
          kind: "status",
        }
      )
    );

    next = pushMsg(next, {
      slaveId,
      from: "system",
      kind: "system",
      text:
        access === "active"
          ? `🗝️ Your Mistress has restored your access. Code ${prev.accessCode} will open the door again.`
          : access === "suspended"
            ? `⏸️ Your access has been suspended. ${note?.trim() || "Your code remains yours; she simply will not turn it."}`
            : `⛔ Your key has been withdrawn. ${note?.trim() || "You are locked out of this house."}`,
    });

    return pushEvent(
      next,
      access === "active"
        ? `🗝️ Access Restored: ${prev.name}`
        : access === "suspended"
          ? `⏸️ Access Suspended: ${prev.name}`
          : `⛔ Key Withdrawn: ${prev.name}`,
      access === "active" ? "green" : "red"
    );
  });
}

/** deliberate rotation — only when a code leaks. Not the same as revoking. */
export function rotateAccessCode(slaveId: string): string {
  const fresh = makeAccessCode();
  update((s) => {
    let next = mapSlave(s, slaveId, (x) =>
      addLog({ ...x, accessCode: fresh, accessChangedAt: Date.now() }, {
        icon: "♻️",
        label: "Code Reissued",
        detail: "A new permanent code was granted",
        devotion: 0,
        kind: "status",
      })
    );
    next = pushMsg(next, {
      slaveId,
      from: "system",
      kind: "system",
      text: `♻️ Your permanent code has been reissued: ${fresh}. The previous code is void.`,
    });
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `♻️ Code Reissued: ${sl.name} → ${fresh}`, "muted");
  });
  return fresh;
}



/* ============================ submissive actions ============================ */
export function subSay(slaveId: string, text: string): { ok: boolean; error?: string } {
  const s = getSlave(slaveId);
  if (!s) return { ok: false, error: "no session" };
  if (isGagged(s))
    return { ok: false, error: `🤐 You are gagged. ${timeLeft(s.gagUntil - Date.now())} remaining. Do not test her.` };
  update((st) => mapSlave(pushMsg(st, { slaveId, from: "sub", kind: "text", text }), slaveId, touchActivity));
  return { ok: true };
}

export const RITUALS = [
  { id: "worship", label: "Worship", icon: "👑", title: "Worship Offered", line: "kneels in worship of his Mistress.", dev: 4 },
  { id: "kneel", label: "Kneel & Wait", icon: "🧎", title: "Kneeling", line: "kneels in silence, eyes lowered, awaiting instruction.", dev: 2 },
  { id: "beg", label: "Beg", icon: "🙏", title: "Begging", line: "begs for his Mistress's attention.", dev: 3 },
  { id: "confess", label: "Confess", icon: "📿", title: "Confession", line: "confesses what he craves and cannot admit aloud.", dev: 3 },
  { id: "serve", label: "Boot Service", icon: "👢", title: "Boot Service", line: "polishes his Mistress's boots with reverence.", dev: 5 },
];

export type RitualResult = { earned: boolean; dev: number; resetsAt: number };

/**
 * A ritual may be performed as often as he likes — kneeling is not rationed —
 * and EVERY press is a real act: it winds the attention-debt timer back and it
 * reaches her thread. What is rationed is the reward: each button earns its
 * devotion at most once per rolling 24 hours, so he cannot button-mash his way
 * to ♥100. Presses on cooldown still show up, folded into one line while he
 * keeps at it (see RITUAL_MERGE_MS) so her thread is not flooded.
 */
export function subRitual(slaveId: string, id: string): RitualResult | null {
  const r = RITUALS.find((x) => x.id === id);
  if (!r) return null;
  let result: RitualResult = { earned: false, dev: 0, resetsAt: 0 };
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => {
      const last = x.lastRitualAt?.[id] || 0;
      const now = Date.now();
      const earns = now - last >= RITUAL_COOLDOWN_MS;
      const nextDev = earns ? Math.min(100, x.devotion + r.dev) : x.devotion;
      result = {
        earned: earns,
        dev: r.dev,
        resetsAt: (earns ? now : last) + RITUAL_COOLDOWN_MS,
      };
      return {
        ...touchActivity(x),
        devotion: nextDev,
        worships: x.worships + 1,
        history: earns ? [...x.history.slice(-6), nextDev] : x.history,
        lastRitualAt: { ...(x.lastRitualAt || {}), ...(earns ? { [id]: now } : {}) },
      };
    });
    const who = next.slaves.find((x) => x.id === slaveId)!;
    next = pushRitual(next, slaveId, who.name, r, result.earned);
    if (result.earned) next = pushEvent(next, `${r.icon} ${who.name} — ${r.title} · devotion +${r.dev}`, "green");
    return next;
  });
  return result;
}

/** fold rapid repeats of the same ritual into the line already on her screen */
function pushRitual(
  s: State,
  slaveId: string,
  name: string,
  r: (typeof RITUALS)[number],
  earned: boolean
): State {
  const now = Date.now();
  const last = s.messages[s.messages.length - 1];
  if (last && last.slaveId === slaveId && last.ritual?.id === r.id && now - last.time < RITUAL_MERGE_MS) {
    return {
      ...s,
      messages: s.messages.map((m, i) =>
        i === s.messages.length - 1
          ? {
              ...m,
              time: now,
              repeat: (m.repeat || 1) + 1,
              /* if the fresh day begins mid-flurry the line still shows the gain */
              ritual: { id: r.id, earned: earned || Boolean(m.ritual?.earned), dev: r.dev },
            }
          : m
      ),
    };
  }
  return pushMsg(s, {
    slaveId,
    from: "sub",
    kind: "decree",
    title: r.title,
    text: `${name} ${r.line}`,
    ritual: { id: r.id, earned, dev: r.dev },
  });
}

/**
 * A submissive OFFERS tribute. Nothing touches his ledger, spend, devotion or
 * the outstanding demand until the Mistress accepts it (see judgeTribute).
 * Rejecting simply discards the offer.
 */
export function payTribute(slaveId: string, amount: number, demandId?: string): { ok: boolean; error?: string } {
  const s = getSlave(slaveId);
  if (!s) return { ok: false, error: "no session" };
  if (s.tributeFrozenUntil > Date.now()) return { ok: false, error: "Tribute is frozen following a safeword." };
  if (s.spentThisMonth + amount > s.spendCap)
    return { ok: false, error: `Blocked by your own spend cap (${money(s.spendCap)}/mo). Raising it takes 24h.` };

  update((st) => {
    let next = mapSlave(st, slaveId, touchActivity);
    next = pushMsg(next, {
      slaveId,
      from: "sub",
      kind: "tribute",
      title: "Tribute Offered",
      text: "Tribute offered — awaiting her judgement.",
      amount,
      verdict: "pending",
      demandId,
    });
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `💰 Tribute Offered: ${sl.name} · ${money(amount)} · awaiting acceptance`, "gold");
  });
  return { ok: true };
}

/** Mistress accepts or rejects a tribute offered by a submissive. */
export function judgeTribute(msgId: string, accept: boolean): { ok: boolean; error?: string } {
  const m = state.messages.find((x) => x.id === msgId);
  if (!m || m.kind !== "tribute" || m.verdict !== "pending") return { ok: false, error: "Nothing pending." };
  const slave = getSlave(m.slaveId);
  if (!slave) return { ok: false, error: "no session" };
  const amount = m.amount || 0;

  /* a safeword between offer and verdict freezes tribute money */
  if (accept && slave.tributeFrozenUntil > Date.now())
    return { ok: false, error: "Tribute is frozen following a safeword — decline the offer instead." };
  if (accept && slave.spentThisMonth + amount > slave.spendCap)
    return { ok: false, error: `Over his monthly spend cap (${money(slave.spendCap)}) — decline the offer.` };

  update((s) => {
    let next: State = {
      ...s,
      messages: s.messages.map((x) =>
        x.id === msgId
          ? {
              ...x,
              verdict: accept ? ("accepted" as const) : ("rejected" as const),
              title: accept ? "Tribute Paid" : "Tribute Declined",
              text: accept ? "Tribute rendered and recorded." : "Tribute declined; nothing was recorded.",
            }
          : x
      ),
    };

    if (accept) {
      next = mapSlave(next, m.slaveId, (x) => {
        const after = Math.min(100, x.devotion + Math.round(amount / 40));
        return {
          ...x,
          ltv: x.ltv + amount,
          spentThisMonth: x.spentThisMonth + amount,
          devotion: after,
          history: [...(x.history || []).slice(-6), after],
        };
      });
      /* the demand this offer answers is settled only on acceptance */
      if (m.demandId)
        next = { ...next, messages: next.messages.map((x) => (x.id === m.demandId ? { ...x, status: "paid" as const } : x)) };
      next = pushMsg(next, {
        slaveId: m.slaveId,
        from: "system",
        kind: "system",
        text: `💰 Your Mistress accepted your tribute of ${money(amount)}. It is on your record. 🖤`,
      });
      const sl = next.slaves.find((x) => x.id === m.slaveId)!;
      next = pushEvent(next, `💰 Tribute Accepted: ${sl.name} · ${money(amount)} · ledger ${money(sl.ltv)}`, "gold");
    } else {
      next = pushMsg(next, {
        slaveId: m.slaveId,
        from: "system",
        kind: "system",
        text: `💰 Your tribute of ${money(amount)} was declined. It was not recorded.`,
      });
      const sl = next.slaves.find((x) => x.id === m.slaveId)!;
      next = pushEvent(next, `⛔ Tribute Declined: ${sl.name} · ${money(amount)}`, "red");
    }
    return next;
  });

  /* ⚖️ Verdict på tribute — som proof: kun i appen, aldrig Telegram-push. */
  return { ok: true };
}

export function declineDemand(slaveId: string, demandId: string) {
  update((s) => {
    let next = mapSlave(s, slaveId, touchActivity);
    next = { ...next, messages: next.messages.map((m) => (m.id === demandId ? { ...m, status: "declined" as const } : m)) };
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(
      pushMsg(next, { slaveId, from: "system", kind: "system", text: "💰 A tribute demand was declined. Your Mistress has been informed." }),
      `⛔ Tribute Declined: ${sl.name}`,
      "red"
    );
  });
}

export function safeword(slaveId: string) {
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => ({
      ...x,
      gagUntil: 0,
      lockUntil: 0,
      penance: null,
      tributeFrozenUntil: Date.now() + 24 * 3600 * 1000,
    }));
    next = pushMsg(next, {
      slaveId,
      from: "system",
      kind: "system",
      text: "🕊️ RED. Every active condition has been cleared and tribute demands are frozen for 24 hours. Both parties have been notified and a support channel is open.",
    });
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `🕊️ Safeword Invoked: ${sl.name} — all conditions cleared`, "red");
  });
}

/** house-wide emergency stop — clears every active condition on every slave */
export function freezeHouse() {
  update((s) => {
    let next: State = {
      ...s,
      slaves: s.slaves.map((x) => ({ ...x, gagUntil: 0, lockUntil: 0, penance: null, tributeFrozenUntil: Date.now() + 3600 * 1000 })),
      messages: s.messages.map((m) => (m.kind === "locreq" && m.locState === "pending" ? { ...m, locState: "expired" as const } : m)),
    };
    s.slaves.forEach((x) => {
      next = pushMsg(next, {
        slaveId: x.id,
        from: "system",
        kind: "system",
        text: "🕊️ SESSION FROZEN. All gags, chastity locks, penances and check-ins have been cleared. Tribute is suspended for one hour.",
      });
    });
    return pushEvent(next, "🕊️ House Frozen — every condition cleared", "red");
  });
}

export function setSpendCap(slaveId: string, cap: number) {
  update((s) => mapSlave(s, slaveId, (x) => ({ ...x, spendCap: cap })));
}

export function toggleLimit(slaveId: string, limit: string) {
  update((s) =>
    mapSlave(s, slaveId, (x) => ({
      ...x,
      hardLimits: x.hardLimits.includes(limit) ? x.hardLimits.filter((l) => l !== limit) : [...x.hardLimits, limit],
    }))
  );
}

export function saveDungeon(d: Partial<Dungeon>) {
  update((s) => ({ ...s, dungeon: { ...s.dungeon, ...d, configured: true } }));
}

export function completePenance(slaveId: string) {
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => ({
      ...touchActivity(x),
      penance: null,
      devotion: Math.min(100, x.devotion + 5),
    }));
    const who = next.slaves.find((x) => x.id === slaveId)!;
    next = pushMsg(next, {
      slaveId,
      from: "sub",
      kind: "decree",
      title: "Penance Reported",
      text: `${who.name} reports his penance complete and awaits judgement.`,
    });
    return pushEvent(next, `⛓️ Penance Completed: ${who.name}`, "green");
  });
}

/* ============================ history log ============================ */
function addLog(x: Slave, e: Omit<LogEntry, "id" | "at">): Slave {
  const entry: LogEntry = { ...e, id: uid(), at: Date.now() };
  return { ...x, log: [entry, ...(x.log || [])].slice(0, 60) };
}

/* ============================ roster ============================ *
 * There is no manual creation path. A submissive exists only because
 * he redeemed an invitation — see redeemInvite().
 * ================================================================= */
export function removeSlave(id: string) {
  update((s) => {
    const sl = s.slaves.find((x) => x.id === id);
    const next: State = { ...s, slaves: s.slaves.filter((x) => x.id !== id) };
    return pushEvent(next, `⛔ Cast Out: ${sl?.name ?? "a submissive"}`, "red");
  });
}

/* ============================ subscription 💳 ============================ *
 * A flat monthly fee, and nothing else. The platform takes no share of
 * any tribute — that money moves directly from him to her.
 * ======================================================================== */

export const currentPlan = () => planOf(state.dungeon.plan);

export function setPlan(id: PlanId) {
  update((s) => {
    const p = planOf(id);
    return pushEvent({ ...s, dungeon: { ...s.dungeon, plan: id } }, `💳 Plan changed to ${p.name}`, "gold");
  });
}

/** feature gate — read this before exposing any advanced capability */
export function has(f: Feature): boolean {
  return planHas(state.dungeon.plan, f);
}

/** roster gate — checked before an invitation can be redeemed */
export function rosterCapacity(): { ok: boolean; used: number; max: number | null } {
  const p = currentPlan();
  return { ok: canAddSlave(state.dungeon.plan, state.slaves.length), used: state.slaves.length, max: p.maxSlaves };
}

/* ============================ telegram 🔔 ============================ */

/** the handle in force for this house — setting beats build-time variable */
export const botUsername = () => resolveBotUsername(state.dungeon.telegramBot);

/** set from the House settings tab; no rebuild required */
export function setTelegramBot(raw: string) {
  const clean = normaliseBotUsername(raw);
  update((s) => {
    const next: State = { ...s, dungeon: { ...s.dungeon, telegramBot: clean || undefined } };
    return pushEvent(next, clean ? `🔔 Telegram bot set to @${clean}` : "🔕 Telegram bot cleared", "muted");
  });
  return clean;
}

/** attach a chat to a profile, so orders can reach his phone */
export function linkTelegram(slaveId: string, link: { chatId: string; username?: string }) {
  update((s) => {
    const next = mapSlave(s, slaveId, (x) => ({
      ...x,
      telegram: { chatId: link.chatId, username: link.username, linkedAt: Date.now() },
      telegramCode: undefined,
    }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    return pushEvent(next, `🔔 Telegram linked: ${sl?.name}`, "green");
  });
}

export function unlinkTelegram(slaveId: string) {
  update((s) => {
    const next = mapSlave(s, slaveId, (x) => ({ ...x, telegram: undefined }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    return pushEvent(next, `🔕 Telegram unlinked: ${sl?.name}`, "muted");
  });
}

/** issue (or reuse) the one-time code he sends to the bot */
export function telegramLinkCode(slaveId: string): string {
  const existing = getSlave(slaveId)?.telegramCode;
  if (existing) return existing;
  const code = makeLinkCode(slaveId);
  update((s) => mapSlave(s, slaveId, (x) => ({ ...x, telegramCode: code })));
  return code;
}

export type Delivery = "sent" | "unlinked" | "plan" | "failed" | "skipped";

export const DELIVERY_LOOK: Record<Delivery, { icon: string; label: string }> = {
  sent: { icon: "🔔", label: "Delivered to his phone" },
  unlinked: { icon: "🔕", label: "Not on Telegram — he must open the app" },
  plan: { icon: "🔒", label: "Telegram requires a higher plan" },
  failed: { icon: "⚠️", label: "Telegram delivery failed" },
  skipped: { icon: "🤫", label: "Not push-worthy — he sees it in the app only" },
};

/**
 * Deliver an alert if the plan allows it and the chat is linked.
 *
 * ⚖️  PUSH POLICY — kun 3 handlingsknapper må buzze hans telefon:
 *
 *  📜 Decree       → ✅ Ja, med lyd (push)
 *  📍 Check-in     → ✅ Ja, med lyd (push)
 *  👠 Send Media   → ✅ Ja, med lyd (push) — håndteres i sendMedia()
 *  ✍️ Almindelig chatbesked                → ❌ Nej — ses kun i appen
 *  ⚖️ Verdict (godkender/afviser proof)    → ❌ Nej — kun i appen
 *  ⏳ Automatisk straf ved udeblevet check → ❌ Nej — kun i appen
 *  ⛓️ Penance, tribute, gag, lock, strike, mercy m.m. → ❌ Nej — kun i appen
 *
 * Alt andet end decree/checkin/media returnerer "skipped" og når aldrig Telegram.
 * Stadig fire-and-forget — en notifikation må aldrig blokere eller reversere en kommando —
 * men resultatet logges, så Mistress ved om en timed order faktisk nåede frem.
 */
export function notifySlave(slaveId: string, kind: AlertKind, body: string): Delivery {
  if (!isPushKind(kind)) return "skipped";
  if (!has("telegram")) return "plan";
  const sl = getSlave(slaveId);
  const chatId = sl?.telegram?.chatId;
  if (!chatId) return "unlinked";

  const appUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}#/gate` : "";
  const alert = buildAlert(kind, body, state.dungeon.name, appUrl);

  void sendTelegram({ chatId, ...alert }).then((ok) => {
    update((s) =>
      mapSlave(s, slaveId, (x) => ({
        ...x,
        lastDelivery: { at: Date.now(), ok, kind },
      }))
    );
    if (!ok) {
      const who = getSlave(slaveId)?.name || "a submissive";
      update((s) => pushEvent(s, `⚠️ Telegram delivery failed: ${who}`, "red"));
    }
  });

  return "sent";
}

/** how an order reaches him right now, before it is even issued
 *  Hvis kind angives og den ikke er push-worthy, returneres "skipped" — kun i appen.
 */
export function deliveryFor(slaveId: string, kind?: AlertKind): Delivery {
  if (kind && !isPushKind(kind)) return "skipped";
  if (!has("telegram")) return "plan";
  return getSlave(slaveId)?.telegram?.chatId ? "sent" : "unlinked";
}

/** helper til at tjekke om en specifik command ville pushe */
export function deliveryForCommand(slaveId: string, cmd: CommandId): Delivery {
  const map: Partial<Record<CommandId, AlertKind>> = {
    decree: "decree",
    locate: "checkin",
  };
  const kind = map[cmd];
  if (!kind) return "skipped";
  return deliveryFor(slaveId, kind);
}

/* ============================ presentation 🖼️ ============================ */

/** her portrait, and the fallback portrait for submissives */
export function setHouseAvatars(input: { avatarUrl?: string; slaveAvatarUrl?: string }) {
  update((s) => ({
    ...s,
    dungeon: {
      ...s.dungeon,
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl.trim() } : {}),
      ...(input.slaveAvatarUrl !== undefined ? { slaveAvatarUrl: input.slaveAvatarUrl.trim() } : {}),
    },
  }));
}

/** override one submissive's portrait; empty string restores the house default */
export function setSlaveAvatar(slaveId: string, url: string) {
  update((s) => {
    const next = mapSlave(s, slaveId, (x) => ({ ...x, avatarUrl: url.trim() || undefined }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    return pushEvent(next, url.trim() ? `🖼️ Portrait Set: ${sl?.name}` : `🖼️ Portrait Cleared: ${sl?.name}`, "muted");
  });
}

/** the backdrop behind every chat in the house */
export function setHouseChatBg(bg: ChatBg) {
  update((s) => pushEvent({ ...s, dungeon: { ...s.dungeon, chatBg: bg } }, "🎨 House backdrop updated", "muted"));
}

/** a backdrop for one conversation; null restores the house backdrop */
export function setSlaveChatBg(slaveId: string, bg: ChatBg | null) {
  update((s) => {
    const next = mapSlave(s, slaveId, (x) => ({ ...x, chatBg: bg || undefined }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    return pushEvent(next, bg ? `🎨 Backdrop Set: ${sl?.name}` : `🎨 Backdrop Reset: ${sl?.name}`, "muted");
  });
}

/** what to actually render for a given submissive */
export function avatarFor(s: Slave | null, d: Dungeon): string {
  return (s?.avatarUrl || d.slaveAvatarUrl || "").trim();
}

export function chatBgFor(s: Slave | null, d: Dungeon): ChatBg {
  return s?.chatBg || d.chatBg || DEFAULT_BG;
}

/* ============================ devotion (manual) ============================ */

/**
 * Direct adjustment by the Mistress. Runs alongside the automatic point
 * system rather than replacing it — every change is still logged.
 */
export function adjustDevotion(slaveId: string, delta: number, reason?: string) {
  if (!delta) return;
  update((s) => {
    const before = s.slaves.find((x) => x.id === slaveId)?.devotion ?? 0;
    const after = Math.max(0, Math.min(100, before + delta));
    if (after === before) return s;
    let next = mapSlave(s, slaveId, (x) =>
      addLog(
        { ...x, devotion: after, lastTouched: Date.now(), history: [...(x.history || []).slice(-6), after] },
        {
          icon: delta > 0 ? "🖤" : "💔",
          label: `Devotion ${delta > 0 ? "Raised" : "Lowered"} · ${delta > 0 ? "+" : ""}${after - before}`,
          detail: reason?.trim() || "Adjusted by Mistress",
          devotion: after - before,
          kind: "status",
        }
      )
    );
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    next = pushMsg(next, {
      slaveId,
      from: "mistress",
      kind: "decree",
      title: delta > 0 ? "Devotion Raised" : "Devotion Lowered",
      text:
        reason?.trim() ||
        (delta > 0
          ? `She has judged you worthy of more. ♥ ${after}`
          : `She has taken devotion from you. ♥ ${after}`),
    });
    return pushEvent(next, `${delta > 0 ? "🖤" : "💔"} Devotion ${delta > 0 ? "+" : ""}${after - before}: ${sl.name} → ♥ ${after}`, delta > 0 ? "green" : "red");
  });
}

/** set an exact value — used by the slider */
export function setDevotion(slaveId: string, value: number, reason?: string) {
  const cur = state.slaves.find((x) => x.id === slaveId)?.devotion ?? 0;
  adjustDevotion(slaveId, Math.max(0, Math.min(100, Math.round(value))) - cur, reason);
}

/* ============================ implements 🩸 ============================ */
export const IMPLEMENTS = [
  { id: "fingers", icon: "🖐️", label: "Fingers", cost: 5, blurb: "Humiliating. Barely a warm-up." },
  { id: "crop", icon: "🏇", label: "Riding Crop", cost: 10, blurb: "Sharp, precise, correcting." },
  { id: "whip", icon: "🪢", label: "Leather Whip", cost: 15, blurb: "She means it now." },
  { id: "cane", icon: "🎋", label: "Cane", cost: 20, blurb: "Cold, clinical, unforgettable." },
  { id: "boots", icon: "👢", label: "Heavy Boots", cost: 25, blurb: "The floor is where you belong." },
] as const;

export type ImplementId = (typeof IMPLEMENTS)[number]["id"];

export function strikeWith(ids: string[], implId: ImplementId, count = 1) {
  const impl = IMPLEMENTS.find((i) => i.id === implId)!;
  const loss = impl.cost * count;
  update((s) => {
    let next = s;
    ids.forEach((id) => {
      next = mapSlave(next, id, (x) =>
        addLog(
          {
            ...x,
            strikes: x.strikes + count,
            devotion: Math.max(0, x.devotion - loss),
            lastTouched: Date.now(),
            history: [...(x.history || []).slice(-6), Math.max(0, x.devotion - loss)],
          },
          {
            icon: impl.icon,
            label: `${impl.label} ×${count}`,
            detail: impl.blurb,
            devotion: -loss,
            kind: "strike",
          }
        )
      );
      next = pushMsg(next, {
        slaveId: id,
        from: "mistress",
        kind: "decree",
        title: "Mistress Strikes",
        text: `${impl.icon} ${impl.label}${count > 1 ? ` · ${count} strokes` : ""}. ${impl.blurb} (−${loss} devotion)`,
      });
    });
    return pushEvent(
      next,
      `${impl.icon} ${impl.label} · ${count} ${count === 1 ? "stroke" : "strokes"} · −${loss} devotion`,
      "red"
    );
  });
  return { impl, loss };
}

/* ============================ punishment wheel 🎡 ============================ */
export type WheelSlice = {
  id: string;
  icon: string;
  label: string;
  short: string;
  color: string;
  apply: (x: Slave) => Slave;
  devotion: number;
};

export const WHEEL: WheelSlice[] = [
  {
    id: "lashes",
    icon: "🪢",
    label: "Fifty Lashes",
    short: "50 lashes",
    color: "#6d1027",
    devotion: -18,
    apply: (x) => ({ ...x, strikes: x.strikes + 2, devotion: Math.max(0, x.devotion - 18) }),
  },
  {
    id: "nosit",
    icon: "🧍",
    label: "Denied the Right to Sit · 2 Hours",
    short: "No sitting · 2h",
    color: "#3f1530",
    devotion: -6,
    apply: (x) => ({
      ...x,
      penance: "You will remain standing for two hours. You have not earned a chair. 🧍",
      devotion: Math.max(0, x.devotion - 6),
    }),
  },
  {
    id: "lines",
    icon: "✍️",
    label: "One Hundred Lines: “I Obey”",
    short: "100 lines",
    color: "#7a5a12",
    devotion: -4,
    apply: (x) => ({
      ...x,
      penance: "Write “I obey” one hundred times by hand, then photograph it. ✍️",
      devotion: Math.max(0, x.devotion - 4),
    }),
  },
  {
    id: "chastity",
    icon: "🔒",
    label: "Chastity · 24 Hours",
    short: "Chastity · 24h",
    color: "#2f1550",
    devotion: -10,
    apply: (x) => ({ ...x, lockUntil: Date.now() + 24 * 3600 * 1000, devotion: Math.max(0, x.devotion - 10) }),
  },
  {
    id: "strike",
    icon: "💥",
    label: "One Additional Strike",
    short: "+1 strike",
    color: "#5a1020",
    devotion: -8,
    apply: (x) => ({ ...x, strikes: x.strikes + 1, devotion: Math.max(0, x.devotion - 8) }),
  },
  {
    id: "gag",
    icon: "🤐",
    label: "Silenced · 1 Hour",
    short: "Gag · 1h",
    color: "#4a3410",
    devotion: -5,
    apply: (x) => ({ ...x, gagUntil: Date.now() + 3600 * 1000, devotion: Math.max(0, x.devotion - 5) }),
  },
  {
    id: "tribute",
    icon: "💰",
    label: "Tribute of $250",
    short: "Tribute $250",
    color: "#6b4a0f",
    devotion: 0,
    apply: (x) => x,
  },
  {
    id: "mercy",
    icon: "🕊️",
    label: "Spared — This Once",
    short: "Spared",
    color: "#14452f",
    devotion: 3,
    apply: (x) => ({ ...x, devotion: Math.min(100, x.devotion + 3) }),
  },
];

/** returns the slice index the wheel must land on */
export function pickWheelSlice() {
  return Math.floor(Math.random() * WHEEL.length);
}

export function applyWheel(slaveId: string, index: number) {
  const slice = WHEEL[index];
  update((s) => {
    let next = mapSlave(s, slaveId, (x) =>
      addLog(slice.apply({ ...x, lastTouched: Date.now() }), {
        icon: slice.icon,
        label: slice.label,
        detail: "Determined by the Wheel of Punishment 🎡",
        devotion: slice.devotion,
        kind: "wheel",
      })
    );
    next = pushMsg(next, {
      slaveId,
      from: "mistress",
      kind: "decree",
      title: "The Wheel Has Spoken",
      text: `${slice.icon} ${slice.label}. The matter is settled.`,
    });
    if (slice.id === "tribute") {
      next = pushMsg(next, {
        slaveId,
        from: "mistress",
        kind: "demand",
        title: "Tribute Demanded",
        text: "The wheel has set your price.",
        amount: 250,
        status: "pending",
      });
    }
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `🎡 ${sl.name} — ${slice.label}`, slice.id === "mercy" ? "green" : "red");
  });
  return slice;
}

/* ============================ conditions ============================ */
export function extendCondition(slaveId: string, what: "gag" | "lock", minutes: number) {
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => {
      const key = what === "gag" ? "gagUntil" : "lockUntil";
      const base = Math.max(x[key], Date.now());
      return addLog({ ...x, [key]: base + minutes * 60000, lastTouched: Date.now() }, {
        icon: what === "gag" ? "🤐" : "🔒",
        label: `${what === "gag" ? "Gag" : "Chastity"} Extended · +${fmtMins(minutes)}`,
        detail: "Extended by Mistress",
        devotion: 0,
        kind: "condition",
      });
    });
    next = pushMsg(next, {
      slaveId,
      from: "mistress",
      kind: "decree",
      title: what === "gag" ? "Gag Extended" : "Chastity Extended",
      text: `A further ${fmtMins(minutes)} has been added. ${what === "gag" ? "🤐" : "🔒"}`,
    });
    return next;
  });
}

export function clearCondition(slaveId: string, what: "gag" | "lock") {
  update((s) => {
    let next = mapSlave(s, slaveId, (x) =>
      addLog({ ...x, [what === "gag" ? "gagUntil" : "lockUntil"]: 0, lastTouched: Date.now() }, {
        icon: "🕊️",
        label: `${what === "gag" ? "Gag" : "Chastity"} Lifted`,
        detail: "Released early by Mistress",
        devotion: 0,
        kind: "condition",
      })
    );
    next = pushMsg(next, {
      slaveId,
      from: "mistress",
      kind: "decree",
      title: what === "gag" ? "Gag Lifted" : "Chastity Released",
      text: `You are released early. ${what === "gag" ? "🤐" : "🔒"} Be grateful.`,
    });
    return next;
  });
}

/** fired once by the UI when a countdown hits zero */
export function penaliseExpiry(slaveId: string, what: "gag" | "lock") {
  update((s) =>
    mapSlave(s, slaveId, (x) =>
      addLog(x, {
        icon: "⏳",
        label: `${what === "gag" ? "Gag" : "Chastity"} Expired`,
        detail: "Countdown reached zero — penalty applied",
        devotion: 0,
        kind: "condition",
      })
    )
  );
}

/* ============================ mistress media / rewards 👠 ============================ */

export const TEASE_CAPTIONS = [
  "Look, and understand that you may not touch. 👠",
  "You have earned a glimpse. Nothing more. 🖤",
  "This is what obedience buys you. ⛓️",
  "You will kneel while you look at this. 👑",
  "I thought of you today. Briefly. 💅",
];

export function sendMedia(
  slaveIds: string[],
  media: Omit<Media, "unlocked" | "views" | "burned">,
  caption: string
) {
  update((s) => {
    let next = s;
    slaveIds.forEach((id) => {
      next = pushMsg(next, {
        slaveId: id,
        from: "mistress",
        kind: "media",
        title: media.lock === "free" ? "Reward Granted" : "Locked Teaser",
        text: caption,
        media: { ...media, unlocked: media.lock === "free", views: 0, burned: false },
      });
      next = mapSlave(next, id, (x) => ({ ...x, lastTouched: Date.now() }));
    });
    const label =
      media.lock === "tribute"
        ? `locked · ${money(media.price || 0)}`
        : media.lock === "devotion"
          ? `locked · ♥${media.need}`
          : "unlocked";
    return pushEvent(
      next,
      `👠 Media Sent: ${slaveIds.length} ${slaveIds.length === 1 ? "recipient" : "recipients"} · ${label}`,
      "gold"
    );
  });

  // 👠 Send Media — ✅ Ja, med lyd — kun denne + decree + checkin må pushe
  slaveIds.forEach((id) =>
    notifySlave(id, "media", media.lock === "free" ? caption || "She has given you something." : "Earn it, and you may look.")
  );
}

/** the submissive tries to open a locked reward */
export function unlockMedia(msgId: string, slaveId: string): { ok: boolean; error?: string } {
  const msg = state.messages.find((m) => m.id === msgId);
  const slave = getSlave(slaveId);
  if (!msg?.media || !slave) return { ok: false, error: "gone" };
  if (msg.media.unlocked) return { ok: true };

  if (msg.media.lock === "devotion") {
    const need = msg.media.need || 0;
    if (slave.devotion < need)
      return {
        ok: false,
        error: `You have not earned this. ♥${need} devotion is required; you hold ♥${slave.devotion}. 🖤`,
      };
  }

  if (msg.media.lock === "tribute") {
    const price = msg.media.price || 0;
    if (slave.tributeFrozenUntil > Date.now()) return { ok: false, error: "Tribute is frozen following a safeword." };
    if (slave.spentThisMonth + price > slave.spendCap)
      return { ok: false, error: `Blocked by your own spend cap (${money(slave.spendCap)}/mo).` };

    update((s) => {
      let next = mapSlave(s, slaveId, (x) => ({
        ...touchActivity(x),
        ltv: x.ltv + price,
        spentThisMonth: x.spentThisMonth + price,
        devotion: Math.min(100, x.devotion + Math.round(price / 40)),
      }));
      next = pushMsg(next, {
        slaveId,
        from: "sub",
        kind: "tribute",
        title: "Tribute Paid",
        text: "Paid to unlock a reward.",
        amount: price,
        /* pay-to-unlock is an instant vending exchange, not an offered tribute */
        verdict: "accepted",
      });
      next = {
        ...next,
        messages: next.messages.map((m) => (m.id === msgId ? { ...m, media: { ...m.media!, unlocked: true } } : m)),
      };
      const sl = next.slaves.find((x) => x.id === slaveId)!;
      return pushEvent(next, `👠 Teaser Unlocked: ${sl.name} paid ${money(price)}`, "gold");
    });
    return { ok: true };
  }

  update((s) => {
    let next: State = {
      ...s,
      messages: s.messages.map((m) => (m.id === msgId ? { ...m, media: { ...m.media!, unlocked: true } } : m)),
    };
    /* choosing to open a reward is activity; merely looking at it (viewMedia) is not */
    next = mapSlave(next, slaveId, touchActivity);
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `👠 Reward Opened: ${sl.name}`, "green");
  });
  return { ok: true };
}

/** count a view; burn-after-reading media is destroyed on close */
export function viewMedia(msgId: string, burnNow = false) {
  update((s) => ({
    ...s,
    messages: s.messages.map((m) =>
      m.id === msgId && m.media
        ? {
            ...m,
            media: {
              ...m.media,
              views: m.media.views + (burnNow ? 0 : 1),
              burned: burnNow && m.media.burn ? true : m.media.burned,
              url: burnNow && m.media.burn ? "" : m.media.url,
            },
          }
        : m
    ),
  }));
}

/* ============================ proof of compliance ============================ */
export function submitProof(
  slaveId: string,
  file: { name: string; url: string | null; mime: string; size: number; path?: string | null },
  note: string
) {
  update((s) => {
    const next = mapSlave(
      pushMsg(s, {
        slaveId,
        from: "sub",
        kind: "proof",
        title: "Proof Submitted",
        text: note || "Proof of compliance submitted for judgement.",
        file,
        verdict: "pending",
      }),
      slaveId,
      touchActivity
    );
    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(next, `📸 Proof Submitted: ${sl.name} — awaiting judgement`, "muted");
  });
}

export function judgeProof(msgId: string, accept: boolean) {
  update((s) => {
    const msg = s.messages.find((m) => m.id === msgId);
    if (!msg) return s;
    let next: State = {
      ...s,
      messages: s.messages.map((m) => (m.id === msgId ? { ...m, verdict: accept ? ("accepted" as const) : ("rejected" as const) } : m)),
    };
    next = mapSlave(next, msg.slaveId, (x) =>
      addLog(
        accept
          ? { ...x, penance: null, devotion: Math.min(100, x.devotion + 8), lastTouched: Date.now() }
          : { ...x, strikes: x.strikes + 1, devotion: Math.max(0, x.devotion - 4), lastTouched: Date.now() },
        {
          icon: accept ? "✅" : "❌",
          label: accept ? "Proof accepted" : "Proof rejected",
          detail: accept ? "Adequate." : "Pathetic. Do it again.",
          devotion: accept ? 8 : -4,
          kind: "proof",
        }
      )
    );
    next = pushMsg(next, {
      slaveId: msg.slaveId,
      from: "mistress",
      kind: "decree",
      title: accept ? "Proof Accepted" : "Proof Rejected",
      text: accept
        ? "Adequate. Your penance is discharged. (+8 devotion) 🖤"
        : "Unacceptable. Do it again, and do it properly. (+1 strike) 💥",
    });
    const sl = next.slaves.find((x) => x.id === msg.slaveId)!;
    return pushEvent(
      next,
      accept ? `✅ Proof Accepted: ${sl.name}` : `❌ Proof Rejected: ${sl.name}`,
      accept ? "green" : "red"
    );
  });

  /* ⚖️ Verdict — ❌ Nej — kun i appen. Godkender/afviser proof trigger aldrig Telegram. */
}

/* ============================ location ============================ */

/** newest still-open location request for a slave */
export function openLocReq(s: State, slaveId: string) {
  return s.messages
    .filter((m) => m.slaveId === slaveId && m.kind === "locreq" && m.locState === "pending")
    .sort((a, b) => b.time - a.time)[0];
}

export function shareLocation(slaveId: string, fix: Fix) {
  update((s) => {
    const req = openLocReq(s, slaveId);
    const late = req ? Date.now() > (req.deadline || 0) : false;

    let next: State = req
      ? { ...s, messages: s.messages.map((m) => (m.id === req.id ? { ...m, locState: "fulfilled" as const } : m)) }
      : s;

    const who = s.slaves.find((x) => x.id === slaveId);
    next = pushMsg(next, {
      slaveId,
      from: "sub",
      kind: "location",
      title: req ? (late ? "Checked In · Late" : "Checked In") : "Location Shared",
      text: req
        ? late
          ? `${who?.name ?? "He"} checked in after the window closed.`
          : `${who?.name ?? "He"} checked in as ordered.`
        : `${who?.name ?? "He"} volunteered his location.`,
      fix,
      reqId: req?.id,
    });

    next = mapSlave(next, slaveId, (x) => ({
      ...touchActivity(x),
      lastFix: fix,
      devotion: Math.min(100, x.devotion + (late ? 0 : 3)),
    }));

    const sl = next.slaves.find((x) => x.id === slaveId)!;
    return pushEvent(
      next,
      late ? `📍 Checked In Late: ${sl.name}` : `📍 Location Confirmed: ${sl.name}`,
      late ? "muted" : "green"
    );
  });
}

/** attach a human-readable place name once reverse geocoding resolves */
export function setFixPlace(slaveId: string, at: number, place: string) {
  update((s) => {
    const next: State = {
      ...s,
      messages: s.messages.map((m) => (m.kind === "location" && m.slaveId === slaveId && m.fix?.at === at ? { ...m, fix: { ...m.fix!, place } } : m)),
      slaves: s.slaves.map((x) => (x.id === slaveId && x.lastFix?.at === at ? { ...x, lastFix: { ...x.lastFix, place } } : x)),
    };
    return next;
  });
}

/** best-effort reverse geocode; silently gives up offline */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { display_name?: string };
    if (!j.display_name) return null;
    return j.display_name.split(",").slice(0, 3).join(",").trim();
  } catch {
    return null;
  }
}

/** called on every tick — expires overdue check-ins and punishes automatically */
export function sweepLocationRequests() {
  const now = Date.now();
  const overdue = state.messages.filter((m) => m.kind === "locreq" && m.locState === "pending" && (m.deadline || 0) < now);
  if (!overdue.length) return;

  update((s) => {
    let next = s;
    overdue.forEach((req) => {
      next = { ...next, messages: next.messages.map((m) => (m.id === req.id ? { ...m, locState: "expired" as const } : m)) };
      next = mapSlave(next, req.slaveId, (x) => ({
        ...x,
        strikes: x.strikes + 1,
        locMisses: (x.locMisses || 0) + 1,
        devotion: Math.max(0, x.devotion - 6),
        penance:
          x.penance ||
          "You ignored a location check-in. Kneel for twenty minutes and photograph it as proof. 📍⛓️",
      }));
      next = pushMsg(next, {
        slaveId: req.slaveId,
        from: "system",
        kind: "system",
        text: "⏳ The check-in window closed without a response. One strike entered, six devotion lost, and a penance assigned automatically.",
      });
      const sl = next.slaves.find((x) => x.id === req.slaveId);
      if (sl) next = pushEvent(next, `⏳ Check-In Missed: ${sl.name} — penalty applied`, "red");
    });
    return next;
  });

  /* ⏳ Automatisk straf ved udeblevet check-in — ❌ Nej — kun i appen. Aldrig push. */
}

/**
 * ⏳ Attention-debt sweep — runs on every tick.
 *
 * Each submissive carries an activity window (default 12 hours, individually
 * overridable per slave). If he has done NOTHING — no chat, ritual, tribute,
 * proof, location, reward unlock — when the window closes, 10 devotion is
 * removed automatically and the timer starts over. Merely opening the app or
 * looking around does not save him.
 *
 * If several whole windows elapsed while nobody had the house open, every
 * complete window is accounted for in one combined penalty on return.
 */
export function sweepAttentionDebt() {
  const now = Date.now();
  const due = state.slaves.filter((x) => now - attentionAnchor(x) >= attentionWindowMs(x));
  if (!due.length) return;

  update((s) => {
    let next = s;
    due.forEach((before) => {
      const id = before.id;
      const win = attentionWindowMs(before);
      const hours = Math.round(win / 3600_000);
      const cycles = Math.max(1, Math.floor((now - attentionAnchor(before)) / win));
      const loss = Math.min(before.devotion, ATTENTION_PENALTY * cycles);
      const after = Math.max(0, before.devotion - loss);
      /* timer starts over from the last expiry — the current partial window is preserved */
      const anchor = attentionAnchor(before) + cycles * win;

      next = mapSlave(next, id, (x) =>
        addLog(
          {
            ...x,
            lastActiveAt: anchor,
            devotion: after,
            history: [...(x.history || []).slice(-6), after],
          },
          {
            icon: "⏳",
            label: "Attention Debt Due",
            detail:
              cycles > 1
                ? `Silent through ${cycles} debt cycles · −${loss} devotion · timer restarted`
                : `No activity for ${hours} hour${hours === 1 ? "" : "s"} · −${ATTENTION_PENALTY} devotion · timer restarted`,
            devotion: -loss,
            kind: "condition",
          }
        )
      );

      next = pushMsg(next, {
        slaveId: id,
        from: "system",
        kind: "system",
        text:
          cycles > 1
            ? `⏳ You were silent long enough for ${cycles} attention debts to come due. ${loss} devotion has been taken from you. The ${hours}-hour timer begins again.`
            : `⏳ Your ${hours}-hour attention debt came due in silence. ${ATTENTION_PENALTY} devotion has been taken from you. The timer begins again.`,
      });

      const sl = next.slaves.find((x) => x.id === id);
      if (sl)
        next = pushEvent(
          next,
          `⏳ Attention Debt: ${sl.name} · ${cycles > 1 ? `${cycles} cycles · ` : ""}−${loss} devotion`,
          "red"
        );
    });
    return next;
  });

  /* ⏳ Automatisk attention-straf — kun i appen, aldrig Telegram-push. */
}

/* ============================ chat housekeeping 🧹 ============================ */

/**
 * Permanently erase the entire one-to-one conversation with a submissive.
 * His profile, devotion, ledger and discipline record are kept; every message
 * — including stored proof and reward files — is destroyed.
 */
export function clearChat(slaveId: string) {
  /* best-effort: delete backing Storage objects before the messages vanish */
  state.messages
    .filter((m) => m.slaveId === slaveId)
    .forEach((m) => {
      void deleteMedia(m.file?.path ?? null);
      void deleteMedia(m.media?.path ?? null);
    });

  update((s) => {
    let next: State = { ...s, messages: s.messages.filter((m) => m.slaveId !== slaveId) };
    next = pushMsg(next, {
      slaveId,
      from: "system",
      kind: "system",
      text: "🧹 Your Mistress cleared this conversation's history.",
    });
    const sl = s.slaves.find((x) => x.id === slaveId);
    return pushEvent(next, `🧹 Chat history cleared: ${sl?.name ?? "a submissive"}`, "muted");
  });
}

/* ============================ attention timer (Mistress) ⏳ ============================ */

/**
 * Individually set a submissive's attention-debt window. Setting a new window
 * starts his timer over from now; pass null to restore the 12h default.
 */
export function setAttentionHours(slaveId: string, hours: number | null) {
  const h = hours == null ? undefined : Math.min(168, Math.max(1, Math.round(hours)));
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => ({ ...x, attentionHours: h, lastActiveAt: Date.now() }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    if (!sl) return next;
    return pushEvent(
      next,
      h
        ? `⏳ Attention timer set to ${h}h: ${sl.name} · timer restarted`
        : `⏳ Attention timer reset to default ${DEFAULT_ATTENTION_HOURS}h: ${sl.name}`,
      "muted"
    );
  });
}

/** wind a submissive's attention-debt timer back to a full window, right now */
export function restartAttention(slaveId: string) {
  update((s) => {
    let next = mapSlave(s, slaveId, (x) => ({ ...x, lastActiveAt: Date.now() }));
    const sl = next.slaves.find((x) => x.id === slaveId);
    return sl ? pushEvent(next, `⏳ Attention timer restarted: ${sl.name}`, "muted") : next;
  });
}

export function mapLinks(lat: number, lng: number) {
  const d = 0.004;
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`,
    open: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
  };
}

/**
 * Prepare a proof attachment: compress in the browser, push the bytes to
 * Storage, and return only the short URL. Nothing large ever reaches
 * Firestore, which is what used to break ~1.4 MB photos.
 */
export async function fileToAttachment(
  file: File
): Promise<{ name: string; url: string | null; mime: string; size: number; path?: string | null } | { error: string }> {
  const r = await uploadImage(file, "proof", { max: 1600, targetBytes: 400_000 });
  if (isUploadFail(r)) return { error: r.error };
  return { name: file.name, url: r.url, mime: file.type, size: r.bytes, path: r.path };
}
