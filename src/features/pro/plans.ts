// The two Pro plans as the paywall shows them. In the app, prices come from the App Store /
// Play Store (they're local to each country); these are the US prices, shown on the web and
// while the store loads.

export type PlanId = "yearly" | "monthly"

export type Plan = {
  id: PlanId
  label: string
  /** "$24.99" */
  price: string
  /** "year" / "month" */
  per: string
  /** For the yearly plan: what it works out to a month ("$2.08"). */
  perMonth: string | null
  /** Free trial length in days, if the plan has one. */
  trialDays: number | null
}

export const PLANS: Record<PlanId, Plan> = {
  yearly: { id: "yearly", label: "Yearly", price: "$24.99", per: "year", perMonth: "$2.08", trialDays: 3 },
  monthly: { id: "monthly", label: "Monthly", price: "$4.99", per: "month", perMonth: null, trialDays: null },
}

/** How much cheaper the yearly plan is than 12 months, as a whole percent. */
export function yearlySavings(yearly: number, monthly: number): number | null {
  if (!(yearly > 0) || !(monthly > 0)) return null
  const savings = Math.round((1 - yearly / (monthly * 12)) * 100)
  return savings > 0 ? savings : null
}

/** $24.99 a year vs $4.99 a month. */
export const DEFAULT_SAVINGS = yearlySavings(24.99, 4.99)

/** Why the paywall opened. Each Pro feature gets its own headline. */
export type ProFeature = "searches" | "almost-there" | "alerts" | "auto-list" | "members" | "diets"

export const FEATURE_HEADLINES: Record<ProFeature, string> = {
  searches: "You've used today's 5 free searches",
  "almost-there": "See recipes you're 1–3 things away from",
  alerts: "Get a heads-up before food goes off",
  "auto-list": "Let the shopping list fill itself",
  members: "Share your pantry with the whole house",
  diets: "Filter recipes for how you eat",
}

/** What Pro includes, in paywall order. */
export const PRO_BENEFITS: { title: string; detail: string }[] = [
  { title: "Unlimited recipe searches", detail: "Free plan: 5 a day" },
  { title: "Almost there recipes", detail: "Ideas you're only 1–3 things away from" },
  { title: "Expiration alerts", detail: "A nudge before food goes to waste" },
  { title: "Automatic shopping list", detail: "What runs out goes straight on the list" },
  { title: "Unlimited housemates", detail: "Free plan: 2 people per pantry" },
  { title: "Diet filters", detail: "Vegetarian, vegan, gluten-free and more" },
]
