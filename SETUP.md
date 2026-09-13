# DOMINION ⛓️ — House of Dom

A control platform for a professional Mistress. **Entry is by invitation only** —
there is no other way for a submissive to appear in a house.

Runs with zero configuration (local mode). Firebase upgrades it to multi-device.

---

## Business model

A **pure subscription**. The platform charges a flat monthly fee and takes
**no commission, no percentage and no affiliate cut**. Tribute moves directly
from the submissive to the Mistress on every plan.

| Plan | Price | Roster | Unlocks |
|---|---|---|---|
| **Chamber** | 199 kr./md. | 5 | Core discipline, invitations, proof of compliance |
| **House** ★ | 499 kr./md. | 25 | + 📍 location · 👠 media · 🎡 wheel · ⚡ batch · 🔔 Telegram |
| **Dynasty** | 999 kr./md. | ∞ | + 🎨 branding · 📊 full ledger · priority support |

Plans live in [`src/lib/plans.ts`](src/lib/plans.ts) — one file, one source of
truth. Gating is enforced in the engine (`fireCommand`, `redeemInvite`), not
merely hidden in the UI.

---

## 1 · Database

Firebase Console → **Build → Firestore Database → Create database** (region `eur3` for Europe).
Then **Build → Storage → Get started** for media rewards 👠.

Publish the rules:

- Firestore → **Rules** → paste [`firestore.rules`](firestore.rules)
- Storage → **Rules** → paste [`storage.rules`](storage.rules). Keep the
  `{file=**}` wildcard: uploads land in a *folder* segment
  (`dominion-media/{houseId}/media/…`), and a single-segment `{file}` matches
  nothing at all — which rejects every upload with a 403 that looks like a
  configuration mystery.

`.env` is already populated with the `house-of-dom` keys.

### The Storage bucket ⚠️

The bucket is **`house-of-dom.firebasestorage.app`**, and it is named explicitly
in code — `getStorage(app, STORAGE_BUCKET)` in [`src/firebase.ts`](src/firebase.ts):

```ts
_storage = getStorage(_app, STORAGE_BUCKET);   // never getStorage(_app) alone
```

Why that matters: `getStorage(app)` on its own reads `app.options.storageBucket`,
and when `VITE_FIREBASE_STORAGE_BUCKET` was never set at build time that value is
`""` — which the SDK accepts as a bucket *name*. Every request then goes to

```
https://firebasestorage.googleapis.com/v0/b//o/…      ← empty bucket segment
```

and fails with a 400 that the browser reports as an opaque CORS error. Passing the
bucket explicitly makes that state unreachable. `VITE_FIREBASE_STORAGE_BUCKET`
still wins when it is set (a `gs://…` prefix, a pasted URL or a trailing slash are
all normalised first — see `normaliseBucket()` in `src/lib/env.ts`), and the
resolved bucket is printed to the console on every boot.

> **Vercel:** `VITE_` values are inlined at *build* time. Setting one after a build
> changes nothing until you redeploy.

## 2 · Data structure

```
houses/{houseId}
  ├─ mistressId                     owner of record — rules key off this
  ├─ state                          live document the UI syncs from
  │    dungeon.avatarUrl            👑 her portrait
  │    dungeon.slaveAvatarUrl       ⛓️ default portrait for submissives
  │    dungeon.chatBg               🎨 house-wide chat backdrop
  │
  ├─ invites/{token}      ⛓️  THE ONLY ENTRY PATH
  │    key            unique token, also the document id
  │    mistressId     who issued it
  │    createdAt      number (ms)
  │    expiresAt      number | null
  │    used           false → true, exactly once
  │    usedBy         slave id that redeemed it
  │    usedAt         number | null
  │    tier           collar granted on redemption
  │    boundName      optional: reserved for one name
  │    revoked        withdrawn before redemption
  │
  ├─ slaves/{slaveId}
  │    mistressId     who he belongs to        ← set at redemption, immutable
  │    invitedBy      the token that admitted him  ← immutable
  │    accessCode     permanent personal code
  │    access         active · suspended · revoked
  │    avatarUrl      🖼️ his portrait — overrides the house default
  │    chatBg         🎨 his backdrop — overrides the house backdrop
  │    …devotion, strikes, tier, limits, spend cap
  │
  ├─ punishments/{logId}   discipline record — Mistress-write only
  ├─ decrees/{msgId}       decrees, penances, proofs, check-ins
  │    imageUrl           📸 the Storage download URL of the attachment
  │    fileName/fileUrl   proof attachment name + URL
  │    mediaUrl           older name for the same URL (kept for compatibility)
  ├─ locations/{id}        📍 pins
  └─ pushSubscriptions/    devices that can receive push
```

## 3 · The invitation flow

**Generate** — Deck → **Invitations** → choose collar tier, validity
(1h / 24h / 7d / never) and optionally reserve it for one name → **Generate Invite**.
Copy the token (`ABCD-1234`) or a shareable link.

**Redeem** — the recipient opens the link (`#/invite/ABCD-1234`, which pre-fills the
form) or types the token at the gate. The system validates existence, expiry,
revocation, name binding and `used === false`, then:

1. marks the invitation `used: true` with `usedBy` and `usedAt`
2. creates his profile bound to that `mistressId` and `invitedBy`
3. issues him a **permanent personal code** for every future visit

Redemption runs inside a Firestore `runTransaction`, so two people racing the same
link cannot both get in — one commits, the other is refused.

**Return** — he signs in with his permanent code. The Mistress can suspend or
withdraw it at any time without destroying his record.

## 4 · How images are handled 📸

Every image in the app goes through one path — `uploadImage()` in `src/lib/storage.ts`:

1. **Compressed in the browser.** Downscaled to a max edge, then quality is
   stepped down until the result fits a target size. A 1.4 MB photo typically
   lands under 200 KB before anything leaves the device.
2. **Uploaded with `uploadBytes(ref(storage, path), file)`** into
   `dominion-media/{houseId}/{proof|media|avatars|backdrops}/`.
3. **`getDownloadURL()` is called on the very same ref**, and only that short
   URL is handed back to the caller.
4. **The URL is saved as `imageUrl`** — on the message itself (`Msg.imageUrl`,
   written by `sendMedia()` and `submitProof()`) and on the Firestore message
   document `houses/{houseId}/decrees/{msgId}.imageUrl` (written by
   `mirrorCollections()` in `src/lib/fire.ts`).

```ts
const r = ref(storage, path);                 // dominion-media/{houseId}/media/…
await uploadBytes(r, payload, { contentType, cacheControl });
const url = await getDownloadURL(r);          // ← exactly this string is stored
```

The UI reads it back through `attachmentUrl(msg)`, which prefers `imageUrl` and
falls back to the older nested `media.url` / `file.url`, so messages written
before the field existed still render.

> **Why this matters.** Firestore documents are capped at **1 MiB**, and base64
> inflates bytes by ~33%. Proof images used to be inlined as data URLs directly
> into the house document, so a single large photo could exceed the cap and
> silently break *every* subsequent write. Storage keeps documents tiny — and
> `attachmentUrlOf()` in `fire.ts` refuses to write a `data:` URL into the
> mirrored message document for the same reason.

`pushHouse()` also carries a safety net: if the document ever approaches
800 KB it strips oversized inline payloads and trims the oldest messages, so a
regression can never wedge the house.

Without Firebase configured, small images (< 320 KB compressed) are still
stored inline so local mode keeps working; larger ones report a clear error.

## 5 · Telegram notification engine 🔔

Telegram's Bot API is free and unmetered — no cost per message, however many
orders she issues.

### Architecture

```
browser ──POST──▶ /api/telegram/send ──▶ Telegram Bot API ──▶ his phone
                  (holds the token)

his phone ──/start CODE──▶ Telegram ──▶ /api/telegram/webhook ──▶ Firestore
                                          (records chatId)
```

The bot token **never reaches the browser**. Both endpoints are standard
`(Request) => Response` handlers, so they run unchanged on Vercel, Netlify Edge
and Cloudflare Workers.

### Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Set the server variables in your hosting dashboard (**not** in `.env`):

   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_WEBHOOK_SECRET=<any long random string>
   FIREBASE_PROJECT_ID=your-project
   FIREBASE_API_KEY=...
   HOUSE_ID=house-of-ash
   APP_ORIGIN=https://your-domain.com
   ```

3. Set the bot handle. **Two ways — the first needs no rebuild:**

   **In the app (recommended).** Deck → **House** → *Telegram bot handle*, or the
   prompt inside the submissive's 🔕 panel. Saved to the house document and
   synced to every device immediately.

   **Or at build time.** In `.env`:

   ```
   VITE_TELEGRAM_BOT_USERNAME=your_bot
   ```

   > ⚠️ `VITE_` variables are **baked in when the bundle is built**. Editing
   > `.env` does nothing until you restart the dev server or rebuild — and an
   > empty value shows the setup prompt, which is what most "no bot configured"
   > reports turn out to be. The house setting exists precisely to avoid this.

   The house setting always wins over the build-time variable. Handles are
   accepted in any form: `@your_bot`, `your_bot`, `t.me/your_bot`, or a full
   `https://t.me/your_bot` URL.

4. Register the webhook once:

   ```bash
   curl -F "url=https://YOUR-DOMAIN/api/telegram/webhook" \
        -F "secret_token=YOUR_WEBHOOK_SECRET" \
        https://api.telegram.org/bot<TOKEN>/setWebhook
   ```

### Verifying a deployment

Both endpoints answer `GET` with a configuration report — no secrets, just
what is present:

```bash
curl https://YOUR-DOMAIN/api/telegram/webhook
```

```json
{
  "service": "telegram-webhook",
  "telegramToken": "set",
  "webhookSecret": "set",
  "firebaseProjectId": "house-of-dom",
  "firebaseApiKey": "set",
  "houseId": "house-of-ash",
  "canRecordLinks": true
}
```

`canRecordLinks: false` means a `/start` will be received but cannot be
saved — and the bot now says so to the submissive instead of falsely
replying "Linked".

### ⚠️ Deploying to Vercel / Netlify

`.env` is **not** deployed — it is gitignored, as it should be. Variables must
be set in the host's dashboard, and they fall into two groups:

| Group | Names | Notes |
|---|---|---|
| **Client** (public) | `VITE_FIREBASE_*`, `VITE_HOUSE_ID`, `VITE_TELEGRAM_BOT_USERNAME` | Inlined at build time — **a redeploy is required** after changing them |
| **Server** (secret) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `HOUSE_ID` | Read per-request, no rebuild needed |

> **The most common production failure**: `VITE_FIREBASE_*` missing from the
> host, so the deployed bundle runs in local mode and reports *"Firebase is not
> configured"* during linking, while everything works locally. The browser
> console now names the exact missing variables at boot.

The server accepts `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_API_KEY` as
fallbacks for the unprefixed names, so setting only the client group still
lets the webhook record links.

`HOUSE_ID` and `VITE_HOUSE_ID` should match — but if they don't, linking
still works: the pairing deep link carries the house id in its payload
(`CODE__house-id`), and the webhook writes where the app is actually looking.

### Endpoints

| Route | Purpose |
|---|---|
| `POST /api/telegram/webhook` | Receives updates; records the chat against a pairing code |
| `GET /api/telegram/webhook` | Configuration report, no secrets |
| `POST /api/telegram/send` | Relay — the only holder of the bot token |
| `GET /api/telegram/status?code=…` | Has this code been claimed? Server-side fallback |

### Linking a submissive

The pairing card sits **inside his chat**, above the composer. Two routes,
both supported because people do both:

- **Deep link** — *Open @bot* opens Telegram with `/start CODE__house-id`
  already filled in. The house travels with the code, so a mismatch between
  `HOUSE_ID` and `VITE_HOUSE_ID` cannot break the link.
- **Bare code** — he types or pastes `MTLEFSB6CO` straight into the chat.
  Anything matching 6–16 letters/digits is treated as a pairing code.

The webhook records the chat under `houses/{houseId}/telegramLinks/{code}`
with a **15-minute expiry**. The app confirms itself: it polls while waiting
and re-checks the moment he returns to the tab. It reads Firestore directly
when it can, and falls back to `GET /api/telegram/status` when the client
bundle has no Firebase config — so linking still completes.

She never handles his chat id.

### What gets delivered

Decrees, penances, check-in demands, tribute demands, media rewards, gags,
chastity locks and proof verdicts. Delivery is fire-and-forget — a failed
notification can never block or reverse a command. The relay throttles to one
message per chat per 1.5 s so a batch command cannot spam him.

Telegram alerts require the **House** plan or above.

## 6 · Web Push (optional) 🔔

Click the connection badge → **Enable notifications**. For push while the tab is
closed, generate VAPID keys and set `VITE_VAPID_PUBLIC_KEY`:

```bash
npx web-push generate-vapid-keys
```

---

## ⚠️ Before real clients

`firestore.rules` is written for **Firebase Auth**, which is not yet enabled — so
every request will currently be denied. Until you turn Auth on, temporarily replace
the `match /houses/{houseId}` block with the open-mode snippet at the bottom of the
rules file. Do not ship that to real users.

Enabling Auth is the natural next step: it is what turns `request.auth.uid` into a
real identity and makes the single-use guarantee enforceable by the database rather
than by the client.
