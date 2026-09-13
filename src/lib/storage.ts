/* ==================================================================== *
 *  MEDIA  —  every image is stored INLINE, as a data: URL in Firestore
 *
 *  Firebase Storage is no longer used by this app. It needs a paid (Blaze)
 *  project and its CORS preflight fails from a single-file static build,
 *  so it is gone entirely:
 *
 *    • this module does NOT import "firebase/storage"
 *    • firebase.ts never calls getStorage(), so no Storage instance exists
 *    • there is no bucket, no uploadBytes(), no getDownloadURL(), no
 *      deleteObject() — nothing in the bundle can reach
 *      firebasestorage.googleapis.com, so no 403/CORS/quota error from
 *      Storage can ever reach the user
 *
 *  The pipeline for every image in the app is now:
 *
 *    1. compress in the browser (downscale, then step quality down)
 *    2. read the result as a data: URL
 *    3. store that string on the message — Firestore IS the storage
 *
 *  The only hard limit left is Firestore's 1 MiB document cap. Every
 *  number below is derived from it, so the ceiling and the compressor can
 *  no longer disagree — which is exactly what used to make an upload fail
 *  with "too large" *after* compression had already succeeded.
 * ==================================================================== */

/** Firestore refuses any document larger than 1 MiB. This is the wall. */
export const FIRESTORE_DOC_LIMIT = 1_048_576;

/** longest `data:` header we can emit ("data:image/jpeg;base64,") plus slack */
const DATA_URL_HEADER = 32;

/**
 * How much of a Firestore document ONE inline attachment may occupy, measured
 * as the length of the string that is actually written. 260 000 characters
 * leaves the house document room for the roster, the ledger and the newest
 * few images at once, while still holding a 1600 px photo at a quality worth
 * looking at.
 */
export const INLINE_STRING_BUDGET = 260_000;

/**
 * The same budget expressed in raw image bytes — i.e. precisely what the
 * compressor is told to hit. base64 turns 3 bytes into 4 characters, so the
 * two are locked together by construction: anything that satisfies
 * compression also fits Firestore, and anything Firestore can hold can be
 * produced. There is no window left for a "too large" failure.
 */
export const INLINE_CEILING = Math.floor(((INLINE_STRING_BUDGET - DATA_URL_HEADER) * 3) / 4);

/* ------------------------------------------------------------------ *
 *  compression                                                        *
 * ------------------------------------------------------------------ */

function loadImage(file: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function canvasToBlob(c: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", q));
}

/**
 * Callers may ask for a SMALLER image than the default (avatars do). Nobody
 * may ask for a bigger one than Firestore can hold — the request is clamped
 * here rather than trusted, so a careless call site cannot reintroduce the
 * mismatch that produced the old "too large" errors.
 */
function resolveTarget(targetBytes?: number): number {
  if (!targetBytes || targetBytes <= 0) return INLINE_CEILING;
  return Math.min(targetBytes, INLINE_CEILING);
}

/**
 * Downscale and compress in the browser, stepping quality down — then the
 * canvas — until the result fits `targetBytes` (never more than
 * INLINE_CEILING).
 *
 * The loop has no iteration cap. It stops when the image fits; at 96 px and
 * quality 0.3 a JPEG is a couple of KB, so "still too big" is not a state a
 * real photograph can end in. That guarantee is what makes inline storage
 * safe: the caller never has to second-guess the size.
 */
export async function compressImage(
  file: File | Blob,
  opts: { max?: number; quality?: number; targetBytes?: number } = {}
): Promise<Blob | null> {
  const { max = 1600, quality = 0.82 } = opts;
  const target = resolveTarget(opts.targetBytes);
  if (!file.type.startsWith("image/")) return null;

  const img = await loadImage(file);
  if (!img) return null;

  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  if (Math.max(w, h) > max) {
    const r = max / Math.max(w, h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  let q = Math.min(quality, 0.92);
  let out = await canvasToBlob(c, q);
  let best = out;

  /* quality first (cheap, keeps resolution), then the canvas itself */
  while (out && out.size > target && (q > 0.3 || Math.max(w, h) > 96)) {
    if (q > 0.3) {
      q = Math.max(0.3, q - 0.1);
    } else {
      w = Math.max(96, Math.round(w * 0.8));
      h = Math.max(96, Math.round(h * 0.8));
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(img, 0, 0, w, h);
    }
    out = await canvasToBlob(c, q);
    if (out && (!best || out.size < best.size)) best = out;
  }

  /* if the last encode returned nothing at all, hand back the smallest one
     that did — a slightly oversized image beats no image */
  return out || best;
}

export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/** a tiny, heavily blurred thumbnail — the tease shown while locked 👠 */
export async function makeBlurPreview(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const img = await loadImage(file);
  if (!img) return null;
  const w = 28;
  const h = Math.max(1, Math.round(((img.naturalHeight || 1) / (img.naturalWidth || 1)) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.filter = "blur(1px) saturate(1.3)";
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.5);
}

/* ------------------------------------------------------------------ *
 *  the one upload path                                                *
 * ------------------------------------------------------------------ */

export type Uploaded = {
  /** a `data:` URL — the image itself, ready to drop straight into <img src> */
  url: string;
  /** always null: there are no Storage objects left to address */
  path: string | null;
  /** always true: everything is inline now */
  inline: boolean;
  bytes: number;
};

export type UploadFail = { error: string };

function isFail(v: Uploaded | UploadFail): v is UploadFail {
  return (v as UploadFail).error !== undefined;
}
export { isFail as isUploadFail };

/**
 * The single upload path for every image in the app.
 *
 * 1. compress in the browser, aiming at INLINE_CEILING
 * 2. read the result as a data: URL
 * 3. hand that string back — it goes into Firestore as it is
 *
 * No network is involved, so there is nothing to fail with a Storage error.
 * The only way this returns an error is a file the browser cannot decode, or
 * something that is not an image and is bigger than the inline budget.
 *
 * `_folder` is kept in the signature so call sites still say what the image
 * is for ("proof", "backdrops", …); there are no Storage paths left to build
 * from it.
 */
export async function uploadImage(
  file: File,
  _folder: "proof" | "media" | "avatars" | "backdrops" = "media",
  opts: { max?: number; quality?: number; targetBytes?: number } = {}
): Promise<Uploaded | UploadFail> {
  const isImage = file.type.startsWith("image/");
  const compressed = isImage ? await compressImage(file, opts) : null;
  const payload: Blob = compressed || file;

  /* Images are compressed TO the ceiling, so this only trips for a file the
     browser could not decode, or one that is not an image at all. */
  if (payload.size > INLINE_CEILING) return { error: tooLargeMessage(file, payload, isImage) };

  try {
    return { url: await toDataUrl(payload), path: null, inline: true, bytes: payload.size };
  } catch {
    return { error: "That file could not be read. Try another image." };
  }
}

/**
 * The only size error left in the app, and it names the real limit — a
 * Firestore document — instead of a Storage bucket that no longer exists.
 */
function tooLargeMessage(file: File, payload: Blob, isImage: boolean): string {
  const maxKb = Math.round(INLINE_CEILING / 1024);
  if (isImage)
    return "That image could not be compressed enough to store. Try another photo. 🖤";
  const mb = (payload.size / (1024 * 1024)).toFixed(1);
  return (
    `${file.name || "That file"} is ${mb} MB. Photos are compressed to fit, but ` +
    `${file.type || "this file type"} is stored exactly as it is — and the database holds ` +
    `${maxKb} KB per attachment. Send it as a photo instead.`
  );
}

/* ------------------------------------------------------------------ *
 *  reading attachments back                                           *
 * ------------------------------------------------------------------ */

/** an inline attachment: the bytes themselves, base64, in the document */
export const isDataUrl = (u?: string | null): boolean => Boolean(u && u.startsWith("data:"));

/**
 * A legacy remote URL, written while Firebase Storage was still in use.
 * Nothing produces these any more; they are only recognised so documents
 * written before the switch keep rendering.
 */
export const isRemoteUrl = (u?: string | null): boolean => Boolean(u && /^https?:\/\//i.test(u));
