import "server-only"

import { cache } from "react"

import { requireViewer } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"

import { DEFAULT_PREFS, type NotificationPrefs } from "./prefs"

/** The signed-in person's three switches (all on until they change one). */
export const getMyNotificationPrefs = cache(async (): Promise<NotificationPrefs> => {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("expiring, list, joined")
    .eq("user_id", viewer.id)
    .maybeSingle()
  if (error) {
    // Before the migration is applied, or on a hiccup: show the defaults.
    console.error("Loading notification settings failed:", error.message)
    return DEFAULT_PREFS
  }
  return data ?? DEFAULT_PREFS
})
