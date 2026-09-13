import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { CLIENT_ENV, isFirebaseConfigured, missingFirebaseVars, reportConfig } from "./lib/env";

/**
 * Firebase initialisation — **Firestore only**.
 *
 * Values come from the build-time environment (see .env.example), so the
 * same source can point at staging or production. If they are absent the
 * app degrades to local mode rather than crashing — but it says so loudly
 * in the console instead of failing silently.
 *
 * Firebase Storage is deliberately NOT initialised. Every image in this app
 * is stored inline as a `data:` URL inside Firestore (see
 * `src/lib/storage.ts`), so `getStorage()` is never called, no bucket is
 * configured and the Storage SDK is never even imported. That is what
 * removes both the paid-plan requirement and the CORS failures that came
 * with uploading from a single-file static build: there is no request to
 * firebasestorage.googleapis.com for a browser to block.
 */
export const firebaseConfig = {
  apiKey: CLIENT_ENV.firebase.apiKey,
  authDomain: CLIENT_ENV.firebase.authDomain,
  projectId: CLIENT_ENV.firebase.projectId,
  messagingSenderId: CLIENT_ENV.firebase.messagingSenderId,
  appId: CLIENT_ENV.firebase.appId,
  measurementId: CLIENT_ENV.firebase.measurementId,
};

/** which house document this client reads and writes */
export const HOUSE_ID = CLIENT_ENV.houseId;

/** exactly which variables are absent — used by the UI, not just logs */
export const MISSING_FIREBASE_VARS = missingFirebaseVars();

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _ok = false;

reportConfig();

if (isFirebaseConfigured()) {
  try {
    /* getApps() guards against double-init under HMR and StrictMode */
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _db = getFirestore(_app);
    _ok = true;
  } catch (e) {
    console.error(
      "[dominion] Firebase initialisation failed — falling back to local mode.\n" +
        "The configuration was present but rejected. Check that the API key and project id belong to the same project.",
      e
    );
    _app = null;
    _db = null;
    _ok = false;
  }
}

/** true only when Firestore is genuinely usable */
export const isFirebase = _ok;

export const app = _app;
export const db = _db;

export default db;
