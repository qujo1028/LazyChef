import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Buckets the app server checks before spending Spoonacular points. Limits live in the database. */
export type RateLimitBucket = "recipe_search" | "recipe_open" | "ingredient_lookup"

/** Postgres error code for "too many tries" (invite codes). */
export const RATE_LIMITED_CODE = "LZ429"

/** Thrown when someone has used up a bucket for now. `message` is safe to show. */
export class RateLimitedError extends Error {
  constructor(message = "That's a lot of lookups for one hour. Try again in a bit.") {
    super(message)
    this.name = "RateLimitedError"
  }
}

/**
 * Counts one use of `bucket` for the signed-in person (take_rate_limit()). Returns false
 * once they're over the limit. If the check itself fails (say the database is behind a
 * deploy), it lets the call through: the daily points guard still applies.
 */
export async function takeRateLimit(bucket: RateLimitBucket): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("take_rate_limit", { p_bucket: bucket })
    if (error) {
      console.error(`[rate-limit] ${bucket} check failed:`, error.message)
      return true
    }
    return data !== false
  } catch (error) {
    console.error(`[rate-limit] ${bucket} check failed:`, error)
    return true
  }
}

/** Throws RateLimitedError when `bucket` is used up. */
export async function requireRateLimit(bucket: RateLimitBucket): Promise<void> {
  if (!(await takeRateLimit(bucket))) throw new RateLimitedError()
}
