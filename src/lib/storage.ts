import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { HOUSE_ID, isFirebase, storage } from "../firebase";

export const isRemote = isFirebase;
export const MEDIA_BUCKET = "dominion-media";

/** Firestore documents cap at 1 MiB; base64 inflates ~33%, so stay well under. */
export const INLINE_CEILING = 320_000;

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
 * Downscale and compress in the browser, stepping quality down until the
 * result fits `targetBytes`. A 1.4 MB photo typically lands under 200 KB.
 */
export async function compressImage(
  file: File | Blob,
  opts: { max?: number; quality?: number; targetBytes?: number } = {}
): Promise<Blob | null> {
  const { max = 1600, quality = 0.82, targetBytes = 500_000 } = opts;
  if (!file.type.startsWith("image/")) return null;

  const img = await loadImage(file);
  if (!img) return null;

  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
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

  let q = quality;
  let out = await canvasToBlob(c, q);

  /* step quality down, then dimensions, until it fits */
  let guard = 0;
  while (out && out.size > targetBytes && guard < 6) {
    guard += 1;
    if (q > 0.45) {
      q -= 0.12;
    } else {
      w = Math.round(w * 0.75);
      h = Math.round(h * 0.75);
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(img, 0, 0, w, h);
    }
    out = await canvasToBlob(c, q);
  }

  return out;
}

/** kept for callers that still expect the old name */
export const shrinkImage = (file: File | Blob, max = 1400, q = 0.82) =>
  compressImage(file, { max, quality: q });

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
 *  upload                                                             *
 * ------------------------------------------------------------------ */

export type Uploaded = {
  /** always a short string: a Storage download URL, or a small data URL */
  url: string;
  path: string | null;
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
 * 1. compress in the browser
 * 2. push the bytes straight to Firebase Storage
 * 3. hand back only the short URL — never the file itself
 *
 * Nothing large is ever written into a Firestore document, which is what
 * used to make ~1.4 MB photos fail against the 1 MiB document limit.
 */
export async function uploadImage(
  file: File,
  folder: "proof" | "media" | "avatars" | "backdrops" = "media",
  opts: { max?: number; targetBytes?: number } = {}
): Promise<Uploaded | UploadFail> {
  const isImage = file.type.startsWith("image/");
  const compressed = isImage ? await compressImage(file, opts) : null;
  const payload: Blob = compressed || file;

  if (isFirebase && storage) {
    try {
      const ext = isImage ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 5);
      const path = `${MEDIA_BUCKET}/${HOUSE_ID}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = ref(storage, path);
      await uploadBytes(r, payload, {
        contentType: isImage ? "image/jpeg" : file.type || "application/octet-stream",
        cacheControl: "public,max-age=31536000",
      });
      const url = await getDownloadURL(r);
      return { url, path, inline: false, bytes: payload.size };
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      console.warn(`[dominion] storage upload failed (${code || "unknown"})`, e);
      /* fall through to inline only if it is small enough to be safe */
      if (payload.size > INLINE_CEILING) {
        return {
          error: code.includes("unauthorized")
            ? "Storage rejected the upload. Publish storage.rules — see SETUP.md."
            : "Upload failed and the file is too large to store inline.",
        };
      }
    }
  }

  /* local mode, or a small file after a storage failure */
  if (payload.size > INLINE_CEILING) {
    return { error: "That image is too large for local mode. Configure Firebase Storage to send full-size photos." };
  }
  try {
    return { url: await toDataUrl(payload), path: null, inline: true, bytes: payload.size };
  } catch {
    return { error: "That file could not be read." };
  }
}

/** legacy shim used by MediaComposer */
export async function uploadMedia(file: File): Promise<Uploaded | null> {
  const r = await uploadImage(file, "media");
  return isFail(r) ? null : r;
}

export async function deleteMedia(path: string | null) {
  if (!path || !isFirebase || !storage) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* ignore */
  }
}
