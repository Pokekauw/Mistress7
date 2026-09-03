/* ==================================================================== *
 *  SUBSCRIPTION PLANS
 *
 *  A pure subscription business. The platform takes a fixed monthly fee
 *  from the Mistress and NOTHING from what passes between her and her
 *  submissives — no commission, no percentage, no affiliate cut.
 *  Tribute flows directly to her, on every plan.
 * ==================================================================== */

export type PlanId = "chamber" | "house" | "dynasty";

/** every gateable capability in the control tower */
export type Feature =
  | "location" // 📍 live check-ins
  | "media" // 👠 rewards & teasers
  | "wheel" // 🎡 punishment wheel
  | "batch" // ⚡ multi-select commands
  | "telegram" // 🔔 Telegram alerts
  | "branding" // 🎨 avatars & chat backdrops
  | "ledger"; // 📊 full tribute ledger

export type Plan = {
  id: PlanId;
  name: string;
  price: number; // kr / month
  tagline: string;
  /** null = unlimited */
  maxSlaves: number | null;
  features: Feature[];
  perks: string[];
  featured?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "chamber",
    name: "Chamber",
    price: 199,
    tagline: "A private room and a handful of devoted.",
    maxSlaves: 5,
    features: [],
    perks: [
      "Up to 5 submissives",
      "Decrees, penance & proof of compliance",
      "Gag & chastity timers",
      "Invitations and permanent codes",
      "100% of tribute is yours",
    ],
  },
  {
    id: "house",
    name: "House",
    price: 499,
    tagline: "A working house with a full roster.",
    maxSlaves: 25,
    features: ["location", "media", "wheel", "batch", "telegram"],
    perks: [
      "Up to 25 submissives",
      "📍 Live location check-ins",
      "👠 Media rewards & locked teasers",
      "🎡 Wheel of Punishment",
      "⚡ Batch commands across the roster",
      "🔔 Telegram alerts",
    ],
    featured: true,
  },
  {
    id: "dynasty",
    name: "Dynasty",
    price: 999,
    tagline: "No ceiling, no limits, no interference.",
    maxSlaves: null,
    features: ["location", "media", "wheel", "batch", "telegram", "branding", "ledger"],
    perks: [
      "Unlimited submissives",
      "Everything in House",
      "🎨 Custom avatars & chat backdrops",
      "📊 Full tribute ledger & export",
      "Priority support",
    ],
  },
];

export const DEFAULT_PLAN: PlanId = "house";

export function planOf(id?: PlanId | string | null): Plan {
  return PLANS.find((p) => p.id === id) || PLANS.find((p) => p.id === DEFAULT_PLAN)!;
}

/** does this plan include the capability? */
export function planHas(id: PlanId | string | undefined, f: Feature): boolean {
  return planOf(id).features.includes(f);
}

/** may she collar another submissive? */
export function canAddSlave(id: PlanId | string | undefined, current: number): boolean {
  const max = planOf(id).maxSlaves;
  return max === null || current < max;
}

/** the cheapest plan that unlocks a capability — used for upgrade prompts */
export function planRequiredFor(f: Feature): Plan {
  return PLANS.find((p) => p.features.includes(f)) || PLANS[PLANS.length - 1];
}

export const FEATURE_LABEL: Record<Feature, string> = {
  location: "📍 Live location check-ins",
  media: "👠 Media rewards",
  wheel: "🎡 Wheel of Punishment",
  batch: "⚡ Batch commands",
  telegram: "🔔 Telegram alerts",
  branding: "🎨 Avatars & backdrops",
  ledger: "📊 Full tribute ledger",
};

/** kr formatting, Danish style */
export function kr(n: number) {
  return `${n.toLocaleString("da-DK")} kr.`;
}
