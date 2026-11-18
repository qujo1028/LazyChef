import { z } from "zod"

import { NO_PREFERENCES, preferencesSchema, staplesSchema, type FoodPreferences, type Staple } from "./options"

// What someone picked in the first-run flow before they had an account. It waits on the
// device (browser storage on the web) until sign-up (preferences) and until they're in a
// household (staples). Each app reads and writes the stored JSON under FIRST_RUN_DRAFT_KEY.

export const FIRST_RUN_DRAFT_KEY = "lazychef:first-run"

export type FirstRunDraft = {
  prefs: FoodPreferences
  /** Saved to the account yet? (Staples wait for a household separately.) */
  prefsSaved: boolean
  /** Whether they answered anything, so an untouched draft doesn't overwrite saved preferences. */
  touched: boolean
  staples: Staple[]
}

export const EMPTY_DRAFT: FirstRunDraft = { prefs: NO_PREFERENCES, prefsSaved: false, touched: false, staples: [] }

const draftSchema = z.object({
  prefs: preferencesSchema.catch(NO_PREFERENCES),
  prefsSaved: z.boolean().catch(false),
  touched: z.boolean().catch(false),
  staples: staplesSchema.catch([]),
})

/** The stored JSON as a draft: missing or broken data reads as empty. */
export function parseDraft(raw: string | null | undefined): FirstRunDraft {
  if (!raw) return EMPTY_DRAFT
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

/** Anything still waiting to be saved? */
export function hasPending(draft: FirstRunDraft): boolean {
  return (draft.touched && !draft.prefsSaved) || draft.staples.length > 0
}
