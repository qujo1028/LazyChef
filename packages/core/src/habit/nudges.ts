// Pure: what the week card says under the ring. At most two lines, in priority order, only the
// ones that apply: expiring food, one ingredient away, a comeback, a first cook.

export type NudgeId = "expiring" | "almost" | "comeback" | "first"

export type Nudge = { id: NudgeId; text: string; href: string; cta: string }

export type NudgeInput = {
  /** Expiring soon (or expired) pantry items: how many, and the soonest one's name. */
  expiring: { count: number; first: string | null }
  /** A recipe exactly one ingredient short, from the cached or local ideas. */
  almost: { id: string; title: string; missing: string } | null
  /** The viewer has gone COMEBACK_DAYS or more without a cook. */
  comeback: boolean
  /** The household has never cooked and a "Make now" recipe exists. */
  firstCook: { id: string; title: string } | null
}

export const MAX_NUDGES = 2

/** The key a dismissal is stored under: one per nudge per day. */
export function dismissKey(today: string, id: NudgeId): string {
  return `${today}:${id}`
}

export function pickNudges(input: NudgeInput, dismissed: ReadonlySet<string>, today: string, max = MAX_NUDGES): Nudge[] {
  const all: Nudge[] = []
  if (input.expiring.count > 0) {
    const first = input.expiring.first
    const text =
      input.expiring.count === 1 && first
        ? `${first} is about to expire.`
        : `${input.expiring.count} things are about to expire.`
    all.push({ id: "expiring", text, href: "/recipes", cta: "Find a recipe" })
  }
  if (input.almost) {
    all.push({
      id: "almost",
      text: `1 ingredient away from ${input.almost.title} (${input.almost.missing}).`,
      href: `/recipes/${input.almost.id}`,
      cta: "See recipe",
    })
  }
  if (input.comeback) {
    all.push({ id: "comeback", text: "Welcome back. Start a 3-day challenge.", href: "/recipes", cta: "Pick a recipe" })
  }
  if (input.firstCook) {
    all.push({
      id: "first",
      text: `Cook your first meal: ${input.firstCook.title}`,
      href: `/recipes/${input.firstCook.id}`,
      cta: "Let's cook",
    })
  }
  return all.filter((nudge) => !dismissed.has(dismissKey(today, nudge.id))).slice(0, max)
}
