/* ==================================================================== *
 *  LINK DIAGNOSIS
 *
 *  "Waiting for the bot…" forever is the worst possible failure: it looks
 *  like patience is required when in fact nothing can ever happen. This
 *  works out which link in the chain is broken and says so plainly.
 *
 *  The chain:
 *    app → /api/telegram/webhook must exist and be registered with Telegram
 *    bot → Firestore must be writable by the server
 *    app → Firestore (or /api/telegram/status) must be readable
 * ==================================================================== */

import { CLIENT_ENV, missingFirebaseVars } from "./env";
import { isFirebase } from "../firebase";

export type Fault =
  | "none"
  | "no-backend" // /api routes are not deployed (static build)
  | "backend-unconfigured" // routes exist but lack server env
  | "no-firebase" // client cannot read Firestore
  | "waiting"; // everything is wired; he simply has not sent it yet

export type Diagnosis = {
  fault: Fault;
  title: string;
  detail: string;
  /** can a link still be completed some other way? */
  manualPossible: boolean;
};

let cached: { at: number; probe: "ok" | "unconfigured" | "missing" } | null = null;

/** is the serverless API actually deployed and configured? */
async function probeBackend(): Promise<"ok" | "unconfigured" | "missing"> {
  if (cached && Date.now() - cached.at < 30_000) return cached.probe;

  const base = CLIENT_ENV.telegramRelay.replace(/\/send\/?$/, "/webhook");
  let probe: "ok" | "unconfigured" | "missing" = "missing";
  try {
    const res = await fetch(base, { method: "GET", headers: { Accept: "application/json" } });
    if (res.ok) probe = "ok";
    else if (res.status === 503) probe = "unconfigured";
    else if (res.status === 404 || res.status === 405) probe = "missing";
    else {
      /* some hosts serve index.html for unknown paths — that is a 200 of HTML */
      const ct = res.headers.get("content-type") || "";
      probe = ct.includes("application/json") ? "unconfigured" : "missing";
    }
    if (probe === "ok") {
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) probe = "missing";
    }
  } catch {
    probe = "missing";
  }

  cached = { at: Date.now(), probe };
  return probe;
}

export async function diagnoseLink(): Promise<Diagnosis> {
  const probe = await probeBackend();

  if (probe === "missing") {
    return {
      fault: "no-backend",
      title: "The bot has nowhere to report to",
      detail:
        "This build is a single static file with no server, so /api/telegram/webhook does not exist. " +
        "Telegram receives the code but cannot record it anywhere. Deploy the api/ folder to Vercel " +
        "(or any host that runs serverless functions) and register the webhook — then linking completes by itself.",
      manualPossible: true,
    };
  }

  if (probe === "unconfigured") {
    return {
      fault: "backend-unconfigured",
      title: "The server is missing its configuration",
      detail:
        "The webhook is deployed but cannot write to the database. Open /api/telegram/webhook in a browser " +
        "to see exactly which variables are missing, set them in your host, and redeploy.",
      manualPossible: true,
    };
  }

  if (!isFirebase) {
    return {
      fault: "no-firebase",
      title: "This device cannot read the database",
      detail:
        `The app is missing ${missingFirebaseVars().join(", ")}, so it cannot see the link the bot recorded. ` +
        "Add them to your host's environment variables and redeploy — VITE_ values are baked in at build time.",
      manualPossible: true,
    };
  }

  return {
    fault: "waiting",
    title: "Nothing received yet",
    detail:
      "Everything is wired correctly. Send the code to the bot — this confirms itself within a few seconds. " +
      "If you already did, check you messaged the right bot.",
    manualPossible: true,
  };
}

/** Telegram chat ids are numeric; groups are negative. */
export function isValidChatId(raw: string): boolean {
  return /^-?\d{5,15}$/.test(raw.trim());
}
