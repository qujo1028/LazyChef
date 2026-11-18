import { EMPTY_DRAFT, FIRST_RUN_DRAFT_KEY, parseDraft, type FirstRunDraft } from "@lazychef/core/preferences/draft"

// The first-run draft in this browser's localStorage (the shape and parsing are in core).

/** Storage can be missing or throw (private windows, blocked site data): treat that as empty. */
export function readDraft(): FirstRunDraft {
  try {
    return parseDraft(window.localStorage.getItem(FIRST_RUN_DRAFT_KEY))
  } catch {
    return EMPTY_DRAFT
  }
}

export function writeDraft(draft: FirstRunDraft) {
  try {
    window.localStorage.setItem(FIRST_RUN_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Nothing to do: the flow still works, the answers just won't survive a reload.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(FIRST_RUN_DRAFT_KEY)
  } catch {
    // Ignore, as above.
  }
}
