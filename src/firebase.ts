import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, ref, type FirebaseStorage } from "firebase/storage";
import {
  CLIENT_ENV,
  isFirebaseConfigured,
  missingFirebaseVars,
  reportConfig,
  STORAGE_BUCKET,
} from "./lib/env";

/**
 * Firebase initialisation.
 *
 * Values come from the build-time environment (see .env.example), so the
 * same source can point at staging or production. If they are absent the
 * app degrades to local mode rather than crashing — but it says so loudly
 * in the console instead of failing silently.
 *
 * `storageBucket` is the one value that must never be empty: the Storage SDK
 * happily builds a request against "" and it lands on `/v0/b//o/`, so every
 * upload fails with a confusing 400/CORS error. STORAGE_BUCKET resolves the
 * environment value or falls back to the house bucket, and is then handed to
 * getStorage() EXPLICITLY so the two can never disagree.
 */
export const firebaseConfig = {
  apiKey: CLIENT_ENV.firebase.apiKey,
  authDomain: CLIENT_ENV.firebase.authDomain,
  projectId: CLIENT_ENV.firebase.projectId,
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: CLIENT_ENV.firebase.messagingSenderId,
  appId: CLIENT_ENV.firebase.appId,
  measurementId: CLIENT_ENV.firebase.measurementId,
};

/** the bucket every upload in this app targets — exported for diagnostics */
export const STORAGE_BUCKET_NAME = STORAGE_BUCKET;

/** which house document this client reads and writes */
export const HOUSE_ID = CLIENT_ENV.houseId;

/** exactly which variables are absent — used by the UI, not just logs */
export const MISSING_FIREBASE_VARS = missingFirebaseVars();

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _ok = false;

reportConfig();

if (isFirebaseConfigured()) {
  try {
    /* getApps() guards against double-init under HMR and StrictMode */
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _db = getFirestore(_app);

    /* ---------------------------------------------------------------- *
     *  The bucket is named EXPLICITLY here.
     *
     *  getStorage(app) on its own falls back to app.options.storageBucket,
     *  and when that env var was never set the SDK receives "" — which is
     *  not null, so it is accepted as a bucket name. Every request then
     *  goes to https://firebasestorage.googleapis.com/v0/b//o/… and dies
     *  with a 400 that surfaces in the browser as an opaque CORS error.
     *
     *  Passing STORAGE_BUCKET makes that state unreachable, including for
     *  an app instance that HMR created earlier with an empty option.
     * ---------------------------------------------------------------- */
    _storage = getStorage(_app, STORAGE_BUCKET);
    _ok = true;

    /* Verify it took. `ref(...).bucket` is the public way to read back the
       bucket a Storage instance will actually address — an empty string here
       means every upload would go to /v0/b//o/ and fail. */
    try {
      const resolved = ref(_storage, "_health").bucket;
      if (!resolved) {
        console.error(
          `[dominion] Firebase Storage resolved to an empty bucket — expected "${STORAGE_BUCKET}". ` +
            "Uploads would be sent to /v0/b//o/ and fail. Check VITE_FIREBASE_STORAGE_BUCKET."
        );
      }
    } catch (e) {
      console.warn("[dominion] could not verify the Storage bucket", e);
    }
  } catch (e) {
    console.error(
      "[dominion] Firebase initialisation failed — falling back to local mode.\n" +
        "The configuration was present but rejected. Check that the API key and project id belong to the same project.",
      e
    );
    _app = null;
    _db = null;
    _storage = null;
    _ok = false;
  }
}

/** true only when Firestore is genuinely usable */
export const isFirebase = _ok;

export const app = _app;
export const db = _db;
export const storage = _storage;

export default db;
