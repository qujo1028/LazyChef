import { z } from "zod"

export const notificationPrefsSchema = z.strictObject({
  expiring: z.boolean(),
  list: z.boolean(),
  joined: z.boolean(),
})

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>

/** What a person gets before they change anything. */
export const DEFAULT_PREFS: NotificationPrefs = { expiring: true, list: true, joined: true }

export const PREF_LABELS: { key: keyof NotificationPrefs; title: string; hint: string }[] = [
  { key: "expiring", title: "Food expiring soon", hint: "A heads up in the evening when something in your pantry is about to go bad." },
  { key: "list", title: "Shopping list changes", hint: "When a housemate adds something to the list." },
  { key: "joined", title: "New housemates", hint: "When someone joins your household." },
]

export const deviceSchema = z.object({
  token: z.string().trim().min(1).max(4096),
  platform: z.enum(["ios", "android"]),
  timezone: z.string().trim().max(64),
  appVersion: z.string().trim().max(40).nullable(),
})

export type DeviceRegistration = z.infer<typeof deviceSchema>
