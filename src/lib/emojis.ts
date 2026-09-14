/* ------------------------------------------------------------------ *
 *  Emojis, by station.
 *
 *  SHE gets favourites: the little snippets she signs her lines with,
 *  plus the whole picker — crowns, gems, candles, everything she wants.
 *
 *  HE gets no favourites at all. A slave does not have a signature, he
 *  has what he is allowed to put in front of her. So his set is tailored:
 *  pleading, worship, service, chains, body-language — enough to please
 *  her properly, and none of her regalia. 👑 is not his to send.
 * ------------------------------------------------------------------ */

export type EmojiGroup = { label: string; emojis: string[] };
export type EmojiPreset = { label: string; value: string };

/** her one-tap signatures — never offered to a slave */
export const MISTRESS_EMOJI_PRESETS: EmojiPreset[] = [
  { label: "Standard", value: "..🖤💅✨" },
  { label: "Sur", value: "😡🖤💅✨" },
  { label: "Arrogant", value: "😏👑💅✨" },
  { label: "Dårligt svar", value: "..🤦‍♀️🙄🖤💅✨" },
  { label: "Vær stille", value: "🤫🖤💅✨" },
  { label: "Dressings", value: "👗🦋👜💅✨" },
  { label: "Kick", value: "💨👢🍒💥" },
  { label: "Lick!", value: "👢👅👅" },
];

export const MISTRESS_EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: "Faces",
    emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖".split(" "),
  },
  {
    label: "Hands & body",
    emojis: "👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 💋".split(" "),
  },
  {
    label: "Hearts & symbols",
    emojis: "🖤 ❤️ 🧡 💛 💚 💙 💜 🤎 🤍 🩶 🩷 🩵 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧️ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟".split(" "),
  },
  {
    label: "Power",
    emojis: "👑 💎 🗝️ ⛓️ 🔒 🔓 🕯️ 🪞 🪄 ✨ 🌟 💫 ⚡ 🔥 🩸 🧿 🪬 🦋 🕸️ 🕷️ 🐍 🦂 🐈‍⬛ 🦇 🦢 🌹 🥀 🍒 🍓 🍷 🥂 🍾 🧊 🎀 🎁 🪩 🎭 🎪 🎯 🏆 🥇 🏅 🎖️ 🧨 💥 💨".split(" "),
  },
  {
    label: "Clothes & objects",
    emojis: "👠 👡 👢 🥿 👞 👟 🩰 🧦 🧤 👜 👛 🎒 👝 👗 👙 🩱 👘 🥻 👚 👕 👖 🧥 🧣 👒 🎩 🧢 ⛑️ 📿 💄 💍 💼 🕶️ 👓 🪭 🧸 🛏️ 🪑 🚪 🪟 🧼 🧴 🧽 🪣 🧹 🧺 🪠 🧻 🪒 🧷 🪡 🧵 ✂️ 📌 📍 📝 ✉️ 📲 📷 🎥 🎙️ 🎧 🔔 🔕 📣".split(" "),
  },
  {
    label: "Animals & nature",
    emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪲 🐞 🦋 🐌 🐛 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🪼 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🦭 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🫎 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🪨 🐚 🪸 🌾 💐 🌷 🌹 🥀 🪻 🪷 🌺 🌸 🌼 🌻".split(" "),
  },
];

/* ------------------------------------------------------------------ */
/*  his set — tailored to a slave, no favourites of hers               */
/* ------------------------------------------------------------------ */

/**
 * Hers. He may not answer with these — the regalia of the house belongs to
 * the Mistress: her crown, her sparkle, her black heart, her rose, her
 * one-tap moods. Anything that slips into a group below is filtered out.
 */
export const SLAVE_FORBIDDEN_EMOJIS = [
  "👑", "💎", "✨", "💅", "🖤", "🥂", "🍾", "🎀", "🏆", "💍", "🕯️", "🌹",
  "👗", "👜", "🤦‍♀️", "🙄", "🤫", "😏", "😡", "💨", "🍒", "💥", "🎩", "💄", "🪞",
];

const FORBIDDEN = new Set(SLAVE_FORBIDDEN_EMOJIS);

/** curated group: single spaces, de-duplicated, nothing of hers gets through */
function slaveGroup(label: string, raw: string): EmojiGroup {
  const seen = new Set<string>();
  const emojis: string[] = [];
  for (const e of raw.trim().split(/\s+/)) {
    if (!e || FORBIDDEN.has(e) || seen.has(e)) continue;
    seen.add(e);
    emojis.push(e);
  }
  return { label, emojis };
}

/**
 * Everything he is given is something she can be pleased by: kneeling,
 * tongue, trembling, scrubbing, and whatever he is prepared to take.
 */
export const SLAVE_EMOJI_GROUPS: EmojiGroup[] = [
  slaveGroup(
    "Pleading",
    "🥺 🥹 🙏 🫡 🙇 🙇‍♂️ 🧎 🧎‍♂️ 😔 😣 😖 😩 😫 😥 😞 😟 😨 😰 😳 🤐 😬 🫠 🫣 👉 👇 ☝️ ✋ 🫳 🙌 ✅ ⏳ 🕰️ 🥲 😓 🥀"
  ),
  slaveGroup(
    "Worship & pleasing",
    "😇 🥰 😍 😘 😗 😚 😙 💋 👄 🫦 👅 💦 🤤 😋 🥵 😌 🫶 ❤️ 💕 💗 💖 💘 💞 💌 😻 🫂 🛐 🍑 🍆 🙏 😊"
  ),
  slaveGroup(
    "Service & chores",
    "🧹 🧽 🪣 🧼 🫧 🧴 🧺 🛁 🚿 🧻 🪒 👢 👞 🧦 🧤 🪑 🚪 🛏️ 📝 📋 ⏱️ 🔔 🔕 🪡 🧵 📦 🧯 🫙"
  ),
  slaveGroup(
    "Chains & what he takes",
    "⛓️ 🔗 🔒 🪢 🩸 😖 😵 😵‍💫 🤕 😷 🤒 🥴 😱 💧 🚽 🧎‍♂️ 🙇 🫢 🥊 ⚖️ 📉 🔻 🚫 ⛔ 🗑️ 🧱 ⛓️‍💥"
  ),
  slaveGroup(
    "Body & mood",
    "👀 👁️ 🧠 🫀 🫁 🦵 🦶 👂 👃 💪 🦾 ✍️ 😴 😪 😮‍💨 😶 🫥 😯 😮 🙂 🙃 😐 😑 🥱 🥶 🫨 🚶 🧍 🛌"
  ),
];

/** every emoji he may pick — used to police his remembered "usuals" */
export const SLAVE_EMOJI_ALLOWED = new Set(SLAVE_EMOJI_GROUPS.flatMap((g) => g.emojis));

/** how many of his own picks the panel keeps, most-used first */
export const SLAVE_EMOJI_USUALS_MAX = 12;
