// Pure: turns the database's answer for "may this household use the AI now?" into a result,
// and words the message for free households that have used their week's allowance.

/** Free households get this many AI recipe uses a week (the migration's limit). */
export const AI_FREE_WEEKLY = 10

/** What an action returns when the free allowance is used up. Compatible with `{ error }`. */
export type AiLimited = { error: string; proLimit: true; resetsAt: string | null }

export type AllowanceRow = { allowed: boolean; pro: boolean; used: number; lim: number; resets_at: string | null }

const DAY_MS = 86_400_000

/** "Your free AI help starts again tomorrow." / "...on Friday." / "...in 4 days." */
export function limitMessage(resetsAt: string | null, now: Date = new Date(), timeZone?: string): string {
  const base = `You've used this week's ${AI_FREE_WEEKLY} free AI recipes.`
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!Number.isFinite(at)) return `${base} Pro makes it unlimited.`
  const hours = (at - now.getTime()) / 3_600_000
  if (hours <= 1) return `${base} More come back within the hour, or Pro makes it unlimited.`
  if (at - now.getTime() < DAY_MS) return `${base} More come back later today, or Pro makes it unlimited.`
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(at))
  return `${base} More come back ${day}, or Pro makes it unlimited.`
}

/** The result for one RPC row: null = go ahead, otherwise the limit result to return. */
export function allowanceResult(row: AllowanceRow | undefined, now: Date = new Date()): AiLimited | null {
  // No row (or a hiccup) lets the call through; the hourly 'ai' limit still applies.
  if (!row || row.allowed) return null
  return { error: limitMessage(row.resets_at, now), proLimit: true, resetsAt: row.resets_at }
}

export const isAiLimited = (result: unknown): result is AiLimited =>
  typeof result === "object" && result !== null && "proLimit" in result && (result as { proLimit?: unknown }).proLimit === true
