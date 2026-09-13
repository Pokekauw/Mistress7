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

That is the whole setup. Publish the rules:

- Firestore → **Rules** → paste [`firestore.rules`](firestore.rules)

`.env` is already populated with the `house-of-dom` keys.

### Firebase Storage is not used ⛔

**Do not create a Storage bucket for this app.** It was dropped deliberately:

- it requires a paid **Blaze** project — the free Spark plan refuses every upload;
- its CORS preflight fails from this app's single-file static build, and the
  browser reports the failure as an opaque CORS error.

Images are stored **inline in Firestore** instead (§4). Consequently:

- `src/firebase.ts` never calls `getStorage()` — the Storage SDK is not imported
  anywhere in the bundle, so nothing can reach `firebasestorage.googleapis.com`;
- `VITE_FIREBASE_STORAGE_BUCKET` is **not read** any more and can be deleted
  from your host's environment variables;
- [`storage.rules`](storage.rules) is optional. If a bucket already exists,
  publishing it refuses writes (nothing new can be billed) while keeping reads
  open, so images uploaded before the switch keep rendering.

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
  │    imageUrl           📸 the attachment as an inline data: URL — the
  │                          image itself, one full copy per message
  │    fileName/fileMime  proof attachment name + type
  │    mediaLock/…        how the reward is locked, and whether he opened it
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

**Everything is inline.** There is no Firebase Storage in this app — no bucket,
no upload, no download URL. Every image in the app goes through one path,
`uploadImage()` in [`src/lib/storage.ts`](src/lib/storage.ts):

1. **Compressed in the browser.** Downscaled to a max edge, then quality is
   stepped down — and then the canvas itself — until the result fits the
   inline budget. The loop has no iteration cap, so it cannot hand back an
   oversized image: a 1.4 MB phone photo lands around 190 KB.
2. **Read as a `data:` URL** with a `FileReader`. No network is involved, so
   there is nothing that can fail with a Storage, CORS or quota error.
3. **Stored as `imageUrl`** — the base64 string itself, on the message
   (`Msg.imageUrl`, written by `sendMedia()` and `submitProof()`) and on that
   message's own Firestore document `houses/{houseId}/decrees/{msgId}`
   (written by `mirrorCollections()` in `src/lib/fire.ts`).

```ts
const compressed = await compressImage(file, opts);   // ≤ INLINE_CEILING bytes
const url = await toDataUrl(compressed);              // "data:image/jpeg;base64,…"
// → stored verbatim as Msg.imageUrl. That is the whole pipeline.
```

The UI reads it back through `attachmentUrl(msg)`, which prefers `imageUrl` and
falls back to the older nested `media.url` / `file.url`, so messages written
earlier — including ones that still hold a `https://firebasestorage…` URL from
before the switch — keep rendering.

### The one limit, and how the numbers fit together

Firestore caps a document at **1 MiB**, and base64 turns 3 bytes into 4
characters. Both numbers in `src/lib/storage.ts` are derived from that single
fact, so the compressor and the ceiling cannot disagree:

| Constant | Value | Meaning |
|---|---|---|
| `FIRESTORE_DOC_LIMIT` | 1 048 576 | Firestore's hard cap per document |
| `INLINE_STRING_BUDGET` | 260 000 | characters one attachment may occupy in a document |
| `INLINE_CEILING` | 194 976 | the same budget in raw image bytes — what compression targets |

`INLINE_CEILING` is *calculated* from `INLINE_STRING_BUDGET`
(`(budget − header) × 3 ÷ 4`), and `compressImage()` clamps every caller's
`targetBytes` down to it. That is what removed the old failure mode, where a
caller asked for a 400 KB image against a 320 KB ceiling and the upload died
with "too large" *after* compression had succeeded.

The image is also stored **once per message**: `sendMedia()` empties
`media.url` and `submitProof()` empties `file.url`, keeping the bytes only in
`imageUrl`. Duplicating them would halve how many images fit.

### What that means in practice

- **The sync document keeps the newest images.** `houses/{houseId}` carries the
  whole state, so when it approaches 800 KB, `slimForFirestore()` drops the
  *oldest* inline images first and whole messages last. The full copy of every
  attachment stays in its own `decrees/{msgId}` document either way.
- **Avatars and backdrops are held to a tighter budget** (120 KB / 160 KB) —
  they live in the house document permanently.
- **Non-image files** (video, audio, PDF) cannot be compressed, so they are
  stored as they are and are refused above `INLINE_CEILING` (~190 KB) with a
  message that names that limit. Photos are the supported path.
- **Without Firebase configured**, the exact same inline path is used — local
  mode and Firestore mode no longer differ.

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
