// Habit design constants. One place, so the card, the cook reward and (later) the stored goal agree.

/** Nights per week the ring aims for. A later worker swaps this for the person's stored goal. */
export const DEFAULT_GOAL = 3

/** Cook days in a Monday-week for each tier. Independent of the goal. */
export const TIER_THRESHOLDS = { bronze: 2, silver: 4, gold: 6 } as const

/** Streak lengths (days in a row) that earn a milestone reward. */
export const STREAK_MILESTONES = [3, 7, 14, 30] as const

/** Days without a cook before the card says "Welcome back". */
export const COMEBACK_DAYS = 3

/** Most cook rows the week card reads (newest first). Rows are per ingredient, batches are far fewer. */
export const COOK_ROW_LIMIT = 3000
