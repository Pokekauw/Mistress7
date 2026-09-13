import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { HOUSE_ID, isFirebase, storage, STORAGE_BUCKET_NAME } from "../firebase";

export const isRemote = isFirebase;
export const MEDIA_BUCKET = "dominion-media";

/** Firestore documents cap at 1 MiB; base64 inflates ~33%, so stay well under. */
export const INLINE_CEILING = 320_000;

/* ------------------------------------------------------------------ *
 *  bucket sanity                                                      *
 * ------------------------------------------------------------------ */

/**
 * The bucket the SDK instance will actually address. Empty means every
 * request would be built as `/v0/b//o/…`, which can only fail — so it is
 * checked before an upload is attempted, never after.
 */
export function storageBucket(): string {
  if (!storage) return "";
  try {
    /* `ref(...).bucket` is the public read-back of the bucket this instance
       will address; the instance itself keeps it in a private field. */
    return ref(storage, "_health").bucket || STORAGE_BUCKET_NAME || "";
  } catch {
    return STORAGE_BUCKET_NAME || "";
  }
}

/** true only when a real bucket is behind the Storage instance */
export function storageUsable(): boolean {
  return Boolean(isFirebase && storage && storageBucket());
}

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
 * 2. `uploadBytes(ref(storage, path), file)` — bytes straight to Storage
 * 3. `getDownloadURL(ref)` — and ONLY that short URL is handed back
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

  /* ---- remote: Firebase Storage ---- */
  if (isFirebase && storage) {
    if (!storageUsable()) {
      console.error(
        `[dominion] Storage is initialised without a bucket — refusing to upload to /v0/b//o/. ` +
          `Expected "${STORAGE_BUCKET_NAME}"; set VITE_FIREBASE_STORAGE_BUCKET and redeploy.`
      );
    } else {
      try {
        const ext = isImage ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 5);
        const path = `${MEDIA_BUCKET}/${HOUSE_ID}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        /* 2 — upload the bytes. ref() is resolved against the explicit bucket. */
        const r = ref(storage, path);
        await uploadBytes(r, payload, {
          contentType: isImage ? "image/jpeg" : file.type || "application/octet-stream",
          cacheControl: "public,max-age=31536000",
        });

        /* 3 — ask Storage for the public URL of what we just wrote */
        const url = await getDownloadURL(r);

        if (!url || !/^https?:\/\//i.test(url)) {
          console.error(`[dominion] getDownloadURL returned "${url}" for ${path}`);
          return { error: "The upload landed but Storage returned no usable URL. Try again." };
        }

        return { url, path, inline: false, bytes: payload.size };
      } catch (e) {
        const code = (e as { code?: string })?.code || "";
        console.warn(`[dominion] storage upload failed (${code || "unknown"}) · bucket ${storageBucket()}`, e);

        /* fall through to inline only if it is small enough to be safe */
        if (payload.size > INLINE_CEILING) {
          return { error: explainUploadError(code) };
        }
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

/**
 * Storage error codes are cryptic and a rules rejection looks identical to a
 * network failure from the UI. Say which one it was, and what to do.
 */
function explainUploadError(code: string): string {
  if (code.includes("unauthorized") || code.includes("permission-denied"))
    return "Storage rejected the upload (403). Publish storage.rules — see SETUP.md §1.";
  if (code.includes("quota-exceeded"))
    return "Storage quota is full. Free space or upgrade the bucket's plan.";
  if (code.includes("unauthenticated"))
    return "Storage needs a signed-in user before it accepts this upload. Check storage.rules.";
  if (code.includes("retry-limit-exceeded") || code.includes("network") || code.includes("unavailable"))
    return "The upload could not reach Firebase Storage. Check the connection and try again.";
  if (code.includes("invalid-") || code.includes("cannot-slice-blob"))
    return "That file could not be uploaded in this format. Try another image.";
  return "Upload failed and the file is too large to store inline.";
}

/** legacy shim used by MediaComposer */
export async function uploadMedia(file: File): Promise<Uploaded | null> {
  const r = await uploadImage(file, "media");
  return isFail(r) ? null : r;
}

export async function deleteMedia(path: string | null) {
  if (!path || !storageUsable() || !storage) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* ignore */
  }
}

/** true for a Storage/remote URL — never for an inline `data:` URL */
export const isRemoteUrl = (u?: string | null): boolean => Boolean(u && /^https?:\/\//i.test(u));
