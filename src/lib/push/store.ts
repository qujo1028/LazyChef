import "server-only"

import { getServerDb } from "@/lib/supabase/service"

import type { Device, PushStore } from "./deliver"
import type { PushKind, PushPlatform } from "./types"

const UNIQUE_VIOLATION = "23505"

/** The real store: Supabase with the secret key (service_role). Null when the key isn't set. */
export function getPushStore(): PushStore | null {
  const db = getServerDb()
  if (!db) return null
  return {
    async devices(userIds) {
      const { data, error } = await db.from("device_tokens").select("user_id, token, platform").in("user_id", userIds)
      if (error) throw new Error(`loading devices: ${error.message}`)
      const byUser = new Map<string, Device[]>()
      for (const row of data) {
        const list = byUser.get(row.user_id) ?? []
        list.push({ token: row.token, platform: row.platform as PushPlatform })
        byUser.set(row.user_id, list)
      }
      return byUser
    },
    async optedOut(userIds, kind) {
      const { data, error } = await db.from("notification_prefs").select(`user_id, ${kind}`).in("user_id", userIds)
      if (error) throw new Error(`loading notification settings: ${error.message}`)
      const rows = data as unknown as ({ user_id: string } & Record<PushKind, boolean>)[]
      return new Set(rows.filter((row) => row[kind] === false).map((row) => row.user_id))
    },
    async claim(userId, kind, key) {
      const { error } = await db.from("notification_log").insert({ user_id: userId, kind, dedupe_key: key })
      if (!error) return true
      if (error.code === UNIQUE_VIOLATION) return false
      throw new Error(`claiming a push: ${error.message}`)
    },
    async release(userId, kind, key) {
      await db.from("notification_log").delete().eq("user_id", userId).eq("kind", kind).eq("dedupe_key", key)
    },
    async forgetTokens(tokens) {
      const { error } = await db.from("device_tokens").delete().in("token", tokens)
      if (error) throw new Error(`removing tokens: ${error.message}`)
    },
  }
}
