import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db, HOUSE_ID, isFirebase } from "../firebase";
import { WRITER_ID, type Msg, type Slave, type State } from "./store";
import { INLINE_STRING_BUDGET, isDataUrl } from "./storage";

/* ------------------------------------------------------------------ */
/*  paths                                                              */
/*                                                                     */
/*  houses/{houseId}                     ← live document (sync source) */
/*  houses/{houseId}/slaves/{slaveId}    ← queryable roster            */
/*  houses/{houseId}/decrees/{msgId}     ← decrees, penances, proofs   */
/*  houses/{houseId}/punishments/{logId} ← the punishment log          */
/*  houses/{houseId}/keys/{code}         ← access keys                 */
/*  houses/{houseId}/locations/{msgId}   ← 📍 pins                      */
/* ------------------------------------------------------------------ */
const houseRef = () => doc(db!, "houses", HOUSE_ID);
const sub = (name: string) => collection(db!, "houses", HOUSE_ID, name);

/** Firestore rejects `undefined` — strip it everywhere. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, val) => (val === undefined ? null : val))) as T;
}

/**
 * The attachment on a message, as one string.
 *
 * Everything is inline now, so this is normally a `data:` URL — the image
 * bytes themselves. Documents written while Firebase Storage was still in
 * use hold an `https://firebasestorage.googleapis.com/…` URL instead, and
 * those are returned unchanged so old messages keep rendering.
 *
 * `imageUrl` is written by the upload flow; `media.url` / `file.url` are the
 * older nested fields, kept only as fallbacks.
 */
function attachmentUrlOf(m: Msg): string | null {
  for (const u of [m.imageUrl, m.media?.url, m.file?.url]) {
    if (typeof u === "string" && u.length > 0) return u;
  }
  return null;
}

/**
 * Same, with a guard: a message written before this change could carry a
 * payload far larger than the budget, and one oversized document would fail
 * the entire mirrored batch. Dropping just that attachment is cheaper.
 */
function attachmentForMirror(m: Msg): string | null {
  const url = attachmentUrlOf(m);
  if (!url) return null;
  if (isDataUrl(url) && url.length > INLINE_STRING_BUDGET) {
    console.warn(`[dominion] attachment on ${m.id} is ${url.length} chars — too large to mirror, skipped`);
    return null;
  }
  return url;
}

/* ------------------------------------------------------------------ */
/*  read                                                               */
/* ------------------------------------------------------------------ */
export async function fetchHouse(): Promise<State | null> {
  if (!isFirebase || !db) return null;
  try {
    const snap = await getDoc(houseRef());
    const data = snap.data() as { state?: State } | undefined;
    return data?.state && Array.isArray(data.state.slaves) ? data.state : null;
  } catch (e) {
    console.warn("[dominion] fetchHouse failed", e);
    return null;
  }
}

/**
 * The webhook writes the chat id here after he messages the bot.
 * Path: houses/{houseId}/telegramLinks/{code}
 */
export async function fetchTelegramLink(code: string): Promise<{ chatId: string; username?: string } | null> {
  if (!isFirebase || !db) return null;
  try {
    const snap = await getDoc(doc(db, "houses", HOUSE_ID, "telegramLinks", code.toUpperCase()));
    if (!snap.exists()) return null;
    const d = snap.data() as { chatId?: string; username?: string; expiresAt?: number };
    if (!d.chatId) return null;
    /* a pairing record is short-lived; refuse a stale one */
    if (typeof d.expiresAt === "number" && d.expiresAt < Date.now()) return null;
    return { chatId: String(d.chatId), username: d.username || undefined };
  } catch (e) {
    /* A rules rejection looks identical to "not linked yet" from the UI,
       which makes it invisible. Name it in the console at least. */
    const code2 = (e as { code?: string })?.code || "";
    if (code2.includes("permission-denied")) {
      console.error(
        `[dominion] Cannot read houses/${HOUSE_ID}/telegramLinks — Firestore rules are refusing it. ` +
          "Publish firestore.rules; the telegramLinks block must allow read."
      );
    } else {
      console.warn("[dominion] telegram link lookup failed", e);
    }
    return null;
  }
}

/** live subscription — fires whenever another device writes */
export function watchHouse(onRemote: (s: State) => void, onStatus: (ok: boolean) => void) {
  if (!isFirebase || !db) return () => {};
  return onSnapshot(
    houseRef(),
    (snap) => {
      onStatus(true);
      const data = snap.data() as { state?: State; rev?: string } | undefined;
      if (!data?.state) return;
      if (data.rev === WRITER_ID) return; // our own echo
      if (!Array.isArray(data.state.slaves)) return;
      onRemote(data.state);
    },
    (e) => {
      console.warn("[dominion] snapshot error", e);
      onStatus(false);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  write                                                              */
/* ------------------------------------------------------------------ */
/** Firestore hard-caps documents at 1 MiB. Keep a safety margin. */
const DOC_CEILING = 800_000;

/** a message document batch may carry — inline payloads make batches heavy */
const BATCH_OPS = 400;
const BATCH_BYTES = 6_000_000;

const approx = (v: unknown) => {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return 0;
  }
};

const isHeavy = (u?: string | null) => Boolean(u && u.startsWith("data:") && u.length > 40_000);

/**
 * Everything is stored inline now, so the house document is the one thing
 * that can grow past Firestore's 1 MiB cap — and one oversized write kills
 * *every* write that follows it, which is why this runs on every push.
 *
 * When it is over budget the OLDEST inline images are dropped first: they
 * are already on every device that has been online, the newest one is the
 * image she is looking at right now, and every message keeps its own copy
 * in `houses/{id}/decrees/{msgId}` regardless. Only if that is not enough
 * does it start dropping whole messages.
 *
 * Exported (not just used by pushHouse) so the trim can be checked against
 * a synthetic state without needing a Firestore write.
 */
export function slimForFirestore(s: State): State {
  let size = approx(s);
  if (size <= DOC_CEILING) return s;

  const messages = s.messages.slice();
  let dropped = 0;

  for (let i = 0; i < messages.length && size > DOC_CEILING; i++) {
    const m = messages[i];
    /* the same payload can sit in two fields; count everything that leaves */
    const payloads = [m.imageUrl, m.media?.url, m.file?.url].filter((u) => isHeavy(u));
    if (!payloads.length) continue;

    const next = { ...m };
    if (isHeavy(next.file?.url)) next.file = { ...next.file!, url: null };
    if (next.media && isHeavy(next.media.url)) next.media = { ...next.media, url: "" };
    if (isHeavy(next.imageUrl)) next.imageUrl = null;
    messages[i] = next;

    size -= payloads.reduce((n, p) => n + (p?.length ?? 0), 0);
    dropped += 1;
  }

  let trimmed: State = dropped ? { ...s, messages } : s;

  /* still too big? drop the oldest messages — the decrees mirror has them */
  while (approx(trimmed) > DOC_CEILING && trimmed.messages.length > 40) {
    trimmed = { ...trimmed, messages: trimmed.messages.slice(-Math.floor(trimmed.messages.length * 0.7)) };
  }

  console.warn(
    "[dominion] house document trimmed to fit Firestore's 1 MiB limit" +
      (dropped ? ` — ${dropped} inline image${dropped === 1 ? "" : "s"} left out of the sync document` : "")
  );
  return trimmed;
}

export async function pushHouse(state: State): Promise<boolean> {
  if (!isFirebase || !db) return false;
  const s = slimForFirestore(state);
  try {
    await setDoc(
      houseRef(),
      clean({
        id: HOUSE_ID,
        name: s.dungeon.name,
        /* owner of record — the security rules key off this field */
        mistressId: HOUSE_ID,
        /* active subscription, mirrored for billing queries */
        plan: s.dungeon.plan || null,
        state: s,
        rev: WRITER_ID,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn("[dominion] pushHouse failed", e);
    return false;
  }
}

/** ids we have already mirrored into sub-collections this session */
const mirrored = { msgs: new Set<string>(), logs: new Set<string>() };

export function primeMirror(s: State) {
  s.messages.forEach((m) => mirrored.msgs.add(m.id));
  s.slaves.forEach((x) => (x.log || []).forEach((l) => mirrored.logs.add(l.id)));
}

/**
 * Mirror the document into normalised collections so the roster,
 * punishment log and keys stay independently queryable in the console —
 * and so every attachment has a document of its own.
 *
 * That last part matters now that images are inline: the house document
 * holds the newest images only (see slimForFirestore), while each message
 * keeps its full `data:` URL here, where the whole 1 MiB belongs to it.
 */
export async function mirrorCollections(s: State) {
  if (!isFirebase || !db) return;
  try {
    type Pending = { ref: ReturnType<typeof doc>; data: Record<string, unknown>; merge: boolean };
    const pending: Pending[] = [];
    const add = (ref: ReturnType<typeof doc>, data: Record<string, unknown>, merge = false) =>
      pending.push({ ref, data: clean(data), merge });

    /* roster */
    s.slaves.forEach((x: Slave) => {
      add(
        doc(sub("slaves"), x.id),
        {
          id: x.id,
          name: x.name,
          tier: x.tier,
          /* ownership — who he belongs to, and the token that admitted him */
          mistressId: x.mistressId,
          invitedBy: x.invitedBy || null,
          /* presentation overrides */
          avatarUrl: x.avatarUrl || null,
          chatBg: x.chatBg || null,
          /* telegram delivery */
          telegramChatId: x.telegram?.chatId || null,
          telegramUsername: x.telegram?.username || null,
          /* permanent personal key + her switch */
          accessCode: x.accessCode,
          access: x.access,
          accessNote: x.accessNote ?? null,
          accessChangedAt: x.accessChangedAt ?? null,
          devotion: x.devotion,
          strikes: x.strikes,
          worships: x.worships,
          ltv: x.ltv,
          /* attention-debt timer */
          lastActiveAt: x.lastActiveAt ?? x.lastTouched ?? null,
          attentionHours: x.attentionHours ?? null,
          lastRitualAt: x.lastRitualAt ?? null,
          gagUntil: x.gagUntil || null,
          lockUntil: x.lockUntil || null,
          penance: x.penance,
          locMisses: x.locMisses || 0,
          hardLimits: x.hardLimits,
          spendCap: x.spendCap,
          lastFix: x.lastFix || null,
          updatedAt: serverTimestamp(),
        },
        true
      );

      /* punishment log */
      (x.log || []).forEach((l) => {
        if (mirrored.logs.has(l.id)) return;
        mirrored.logs.add(l.id);
        add(doc(sub("punishments"), l.id), { ...l, slaveId: x.id, slaveName: x.name, createdAt: serverTimestamp() });
      });
    });

    /* invitations */
    s.invites.forEach((i) => {
      add(doc(sub("invites"), i.key), { ...i, updatedAt: serverTimestamp() }, true);
    });



    /* messages: new ones, plus anything whose status can still change */
    s.messages.forEach((m: Msg) => {
      const mutable =
        m.kind === "locreq" ||
        m.kind === "proof" ||
        m.kind === "demand" ||
        m.kind === "media" ||
        m.kind === "tribute";
      if (mirrored.msgs.has(m.id) && !mutable) return;
      mirrored.msgs.add(m.id);

      /* The attachment is written ONCE, into imageUrl. `file` and `media`
         carry the same base64 payload, so copying them across as well would
         spend this document's 1 MiB three times over. */
      const { file, media, ...rest } = m;
      add(
        doc(sub("decrees"), m.id),
        {
          ...rest,
          /** the inline data: URL — the image itself, stored in the database */
          imageUrl: attachmentForMirror(m),
          hasFile: Boolean(file),
          fileName: file?.name ?? null,
          fileMime: file?.mime ?? media?.mime ?? null,
          mediaLock: media?.lock ?? null,
          mediaUnlocked: media?.unlocked ?? null,
        },
        true
      );

      if (m.kind === "location" && m.fix) {
        add(doc(sub("locations"), m.id), { slaveId: m.slaveId, ...m.fix }, true);
      }
    });

    /* Commit in chunks. Inline base64 makes a batch orders of magnitude
       heavier than it used to be, and a single Write request is capped well
       below what 400 media documents would add up to — so a batch is closed
       on whichever limit comes first. */
    for (let i = 0; i < pending.length; ) {
      const batch = writeBatch(db);
      let ops = 0;
      let bytes = 0;
      while (i < pending.length && ops < BATCH_OPS && bytes < BATCH_BYTES) {
        const w = pending[i++];
        /* the SDK's two set() overloads are distinct — an explicit
           `undefined` matches neither, so branch instead */
        if (w.merge) batch.set(w.ref, w.data, { merge: true });
        else batch.set(w.ref, w.data);
        ops += 1;
        bytes += approx(w.data);
      }
      await batch.commit();
    }
  } catch (e) {
    console.warn("[dominion] mirror failed", e);
  }
}
