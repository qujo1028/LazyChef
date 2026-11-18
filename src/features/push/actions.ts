"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireViewer } from "@/features/household/queries"
import type { ActionResult } from "@lazychef/core/pantry/types"
import { createClient } from "@/lib/supabase/server"

import { deviceSchema, notificationPrefsSchema, type DeviceRegistration, type NotificationPrefs } from "@lazychef/core/push/prefs"

/** Saves this phone's push token for the signed-in person (also refreshes its time zone and last-seen time). */
export async function registerDeviceToken(input: DeviceRegistration): Promise<ActionResult> {
  const parsed = deviceSchema.safeParse(input)
  if (!parsed.success) return { error: "That device didn't look right." }

  await requireViewer()
  const supabase = await createClient()
  const { token, platform, timezone, appVersion } = parsed.data
  const { error } = await supabase.rpc("register_device_token", {
    p_token: token,
    p_platform: platform,
    p_timezone: timezone,
    p_app_version: appVersion,
  })
  if (error) {
    console.error("Registering a device failed:", error.message)
    return { error: "Couldn't turn on notifications. Try again." }
  }
  return {}
}

/** Forgets this phone's token (sign-out, or turning notifications off). Only your own rows can go. */
export async function removeDeviceToken(token: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1).max(4096).safeParse(token)
  if (!parsed.success) return {}

  await requireViewer()
  const supabase = await createClient()
  const { error } = await supabase.from("device_tokens").delete().eq("token", parsed.data)
  if (error) {
    console.error("Removing a device failed:", error.message)
    return { error: "Couldn't turn off notifications on this phone." }
  }
  return {}
}

export async function saveNotificationPrefs(input: NotificationPrefs): Promise<ActionResult> {
  const parsed = notificationPrefsSchema.safeParse(input)
  if (!parsed.success) return { error: "Those settings didn't look right. Try again." }

  await requireViewer()
  const supabase = await createClient()
  const { expiring, list, joined } = parsed.data
  const { error } = await supabase.rpc("set_my_notification_prefs", { p_expiring: expiring, p_list: list, p_joined: joined })
  if (error) {
    console.error("Saving notification settings failed:", error.message)
    return { error: "Couldn't save that. Try again." }
  }
  revalidatePath("/household")
  return {}
}
