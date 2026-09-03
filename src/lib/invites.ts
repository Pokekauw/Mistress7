import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, HOUSE_ID, isFirebase } from "../firebase";
import type { Tier } from "./store";

/* ------------------------------------------------------------------ *
 *  invites — the single way anyone enters this house
 *  Firestore path:  houses/{houseId}/invites/{token}
 * ------------------------------------------------------------------ */

export type Invite = {
  /** the token the submissive types — also the document id */
  key: string;
  mistressId: string;
  createdAt: number;
  expiresAt: number | null;
  used: boolean;
  usedBy: string | null;
  usedAt: number | null;
  /** collar granted on redemption */
  tier: Tier;
  /** optional: only this name may redeem it */
  boundName: string;
  revoked: boolean;
};

export const INVITE_TTL = [
  { label: "1 hour", h: 1 },
  { label: "24 hours", h: 24 },
  { label: "7 days", h: 168 },
  { label: "Never", h: 0 },
];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function makeToken(): string {
  const block = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  return `${block(4)}-${block(4)}`;
}

export const normaliseToken = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export function inviteStatus(i: Invite): "used" | "revoked" | "expired" | "open" {
  if (i.used) return "used";
  if (i.revoked) return "revoked";
  if (i.expiresAt && i.expiresAt < Date.now()) return "expired";
  return "open";
}

export function inviteLink(token: string) {
  const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  return `${base}#/invite/${token}`;
}

/* ------------------------------------------------------------------ *
 *  Firestore operations. Each returns quietly in local mode so the
 *  in-memory store remains the single source of truth for the UI.
 * ------------------------------------------------------------------ */
const invitesCol = () => collection(db!, "houses", HOUSE_ID, "invites");

export async function fsCreateInvite(inv: Invite) {
  if (!isFirebase || !db) return;
  try {
    await setDoc(doc(invitesCol(), inv.key), {
      key: inv.key,
      mistressId: inv.mistressId,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      used: false,
      usedBy: null,
      usedAt: null,
      tier: inv.tier,
      boundName: inv.boundName || null,
      revoked: false,
      createdAtServer: serverTimestamp(),
    });
  } catch (e) {
    console.warn("[dominion] invite create failed", e);
  }
}

export async function fsRevokeInvite(token: string) {
  if (!isFirebase || !db) return;
  try {
    await setDoc(doc(invitesCol(), token), { revoked: true }, { merge: true });
  } catch (e) {
    console.warn("[dominion] invite revoke failed", e);
  }
}

export async function fsDeleteInvite(token: string) {
  if (!isFirebase || !db) return;
  try {
    await deleteDoc(doc(invitesCol(), token));
  } catch (e) {
    console.warn("[dominion] invite delete failed", e);
  }
}

export type RedeemOutcome =
  | { ok: true; invite: Invite }
  | { ok: false; reason: "missing" | "used" | "revoked" | "expired" | "bound" | "denied" | "error" };

/**
 * Atomically claim a token. The transaction is what makes this bulletproof:
 * two devices racing on the same token cannot both win.
 */
export async function fsRedeemInvite(token: string, slaveId: string, name: string): Promise<RedeemOutcome> {
  if (!isFirebase || !db) return { ok: false, reason: "error" };

  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(invitesCol(), token);
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, reason: "missing" } as RedeemOutcome;

      const data = snap.data() as Invite;
      if (data.used) return { ok: false, reason: "used" } as RedeemOutcome;
      if (data.revoked) return { ok: false, reason: "revoked" } as RedeemOutcome;
      if (data.expiresAt && data.expiresAt < Date.now()) return { ok: false, reason: "expired" } as RedeemOutcome;
      if (data.boundName && data.boundName.toLowerCase() !== name.trim().toLowerCase())
        return { ok: false, reason: "bound" } as RedeemOutcome;

      tx.update(ref, { used: true, usedBy: slaveId, usedAt: Date.now(), redeemedAt: serverTimestamp() });
      return { ok: true, invite: { ...data, used: true, usedBy: slaveId, usedAt: Date.now() } } as RedeemOutcome;
    });
  } catch (e) {
    /* A rules rejection is NOT a missing token — surfacing it as one sends
       people hunting for a typo when the real problem is configuration. */
    const code = (e as { code?: string })?.code || "";
    const denied = code.includes("permission-denied") || code.includes("unauthenticated");
    console.warn(`[dominion] invite redeem failed (${code || "unknown"})`, e);
    return { ok: false, reason: denied ? "denied" : "error" };
  }
}

export async function fsFetchInvite(token: string): Promise<Invite | null> {
  if (!isFirebase || !db) return null;
  try {
    const snap = await getDoc(doc(invitesCol(), token));
    return snap.exists() ? (snap.data() as Invite) : null;
  } catch {
    return null;
  }
}

/** one-time housekeeping: wipe legacy `keys` docs and seeded test data */
export async function fsPurgeLegacy() {
  if (!isFirebase || !db) return 0;
  let n = 0;
  for (const name of ["keys", "masterKeys", "slaves", "decrees", "punishments", "locations"]) {
    try {
      const snap = await getDocs(collection(db, "houses", HOUSE_ID, name));
      await Promise.all(
        snap.docs.map((d) =>
          deleteDoc(d.ref).then(
            () => (n += 1),
            () => {}
          )
        )
      );
    } catch {
      /* collection may not exist */
    }
  }
  return n;
}
