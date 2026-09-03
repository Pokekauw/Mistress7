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

/**
 * Strip anything bulky that should have gone to Storage. Without this a
 * single oversized inline image silently kills every subsequent write to
 * the house document.
 */
function slimForFirestore(s: State): State {
  const approx = (v: unknown) => {
    try {
      return JSON.stringify(v)?.length ?? 0;
    } catch {
      return 0;
    }
  };
  if (approx(s) < DOC_CEILING) return s;

  const isHeavy = (u?: string | null) => Boolean(u && u.startsWith("data:") && u.length > 40_000);

  let trimmed: State = {
    ...s,
    messages: s.messages.map((m) => {
      const next = { ...m };
      if (isHeavy(next.file?.url)) next.file = { ...next.file!, url: null };
      if (next.media && isHeavy(next.media.url)) next.media = { ...next.media, url: "" };
      return next;
    }),
  };

  /* still too big? drop the oldest messages — history is mirrored anyway */
  while (approx(trimmed) > DOC_CEILING && trimmed.messages.length > 40) {
    trimmed = { ...trimmed, messages: trimmed.messages.slice(-Math.floor(trimmed.messages.length * 0.7)) };
  }
  console.warn("[dominion] house document trimmed to fit Firestore's 1 MiB limit");
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
 * punishment log and keys stay independently queryable in the console.
 */
export async function mirrorCollections(s: State) {
  if (!isFirebase || !db) return;
  try {
    const batch = writeBatch(db);
    let ops = 0;
    const bump = () => (ops += 1);

    /* roster */
    s.slaves.forEach((x: Slave) => {
      batch.set(
        doc(sub("slaves"), x.id),
        clean({
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
          gagUntil: x.gagUntil || null,
          lockUntil: x.lockUntil || null,
          penance: x.penance,
          locMisses: x.locMisses || 0,
          hardLimits: x.hardLimits,
          spendCap: x.spendCap,
          lastFix: x.lastFix || null,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      bump();

      /* punishment log */
      (x.log || []).forEach((l) => {
        if (mirrored.logs.has(l.id)) return;
        mirrored.logs.add(l.id);
        batch.set(
          doc(sub("punishments"), l.id),
          clean({ ...l, slaveId: x.id, slaveName: x.name, createdAt: serverTimestamp() })
        );
        bump();
      });
    });

    /* invitations */
    s.invites.forEach((i) => {
      batch.set(doc(sub("invites"), i.key), clean({ ...i, updatedAt: serverTimestamp() }), { merge: true });
      bump();
    });



    /* messages: new ones, plus anything whose status can still change */
    s.messages.forEach((m: Msg) => {
      const mutable = m.kind === "locreq" || m.kind === "proof" || m.kind === "demand" || m.kind === "media";
      if (mirrored.msgs.has(m.id) && !mutable) return;
      mirrored.msgs.add(m.id);

      /* keep inline base64 out of Firestore's 1 MiB document limit */
      const { file, media, ...rest } = m;
      batch.set(
        doc(sub("decrees"), m.id),
        clean({
          ...rest,
          hasFile: Boolean(file),
          fileName: file?.name ?? null,
          mediaUrl: media && !String(media.url).startsWith("data:") ? media.url : null,
          mediaLock: media?.lock ?? null,
          mediaUnlocked: media?.unlocked ?? null,
        }),
        { merge: true }
      );
      bump();

      if (m.kind === "location" && m.fix) {
        batch.set(doc(sub("locations"), m.id), clean({ slaveId: m.slaveId, ...m.fix }), { merge: true });
        bump();
      }
    });

    if (ops > 0) await batch.commit();
  } catch (e) {
    console.warn("[dominion] mirror failed", e);
  }
}
