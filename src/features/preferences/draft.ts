import { z } from "zod"

import { NO_PREFERENCES, preferencesSchema, staplesSchema, type FoodPreferences, type Staple } from "./options"

// What someone picked in the first-run flow before they had an account. It waits in this
// browser until sign-up (preferences) and until they're in a household (staples).

const KEY = "lazychef:first-run"

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

/** Storage can be missing or throw (private windows, blocked site data): treat that as empty. */
export function readDraft(): FirstRunDraft {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

export function writeDraft(draft: FirstRunDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Nothing to do: the flow still works, the answers just won't survive a reload.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Ignore, as above.
  }
}

/** Anything still waiting to be saved? */
export function hasPending(draft: FirstRunDraft): boolean {
  return (draft.touched && !draft.prefsSaved) || draft.staples.length > 0
}
