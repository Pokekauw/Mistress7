import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { CLIENT_ENV, isFirebaseConfigured, missingFirebaseVars, reportConfig } from "./lib/env";

/**
 * Firebase initialisation.
 *
 * Values come from the build-time environment (see .env.example), so the
 * same source can point at staging or production. If they are absent the
 * app degrades to local mode rather than crashing — but it says so loudly
 * in the console instead of failing silently.
 */
export const firebaseConfig = {
  apiKey: CLIENT_ENV.firebase.apiKey,
  authDomain: CLIENT_ENV.firebase.authDomain,
  projectId: CLIENT_ENV.firebase.projectId,
  storageBucket: CLIENT_ENV.firebase.storageBucket,
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
let _storage: FirebaseStorage | null = null;
let _ok = false;

reportConfig();

if (isFirebaseConfigured()) {
  try {
    /* getApps() guards against double-init under HMR and StrictMode */
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _db = getFirestore(_app);
    _storage = getStorage(_app);
    _ok = true;
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
