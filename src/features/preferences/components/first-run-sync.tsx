"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { addStaples } from "@/features/pantry/actions"
import { actionError, callAction } from "@/lib/call-action"

import { savePreferences } from "../actions"
import { hasPending } from "../draft"
import { resetDraft, setDraft, useFirstRunDraft } from "../use-draft"

/**
 * Saves what someone picked in the welcome flow once they're signed in: preferences right
 * away, starter staples once they're in a household. Mounted on /onboarding and in the app.
 * Renders nothing; failures leave the draft in place to retry on the next page load.
 */
export function FirstRunSync({ hasHousehold }: { hasHousehold: boolean }) {
  const [draft] = useFirstRunDraft()
  const running = useRef(false)

  useEffect(() => {
    if (running.current || !hasPending(draft)) return
    running.current = true
    void (async () => {
      let next = draft
      if (next.touched && !next.prefsSaved) {
        const error = actionError(await callAction(() => savePreferences(next.prefs)))
        if (error) {
          console.warn("Saving first-run preferences failed:", error)
          return
        }
        next = { ...next, prefsSaved: true }
        setDraft(next)
      }
      if (hasHousehold && next.staples.length > 0) {
        const count = next.staples.length
        const error = actionError(await callAction(() => addStaples(next.staples)))
        if (error) {
          console.warn("Adding starter staples failed:", error)
          return
        }
        toast.success(`Added ${count} ${count === 1 ? "staple" : "staples"} to your pantry`)
        next = { ...next, staples: [] }
      }
      if (hasPending(next)) setDraft(next)
      else resetDraft()
    })().finally(() => {
      running.current = false
    })
  }, [draft, hasHousehold])

  return null
}
