import "server-only"

import { getSender } from "./index"
import { deliverToUsers, type PushStore } from "./deliver"
import { getPushStore } from "./store"
import type { PushSender } from "./types"
import { getServerDb } from "@/lib/supabase/service"

const BUCKET_MS = 5 * 60 * 1000

/** Five-minute slot a moment falls in. */
export const timeBucket = (ms: number) => Math.floor(ms / BUCKET_MS)

type Deps = { sender?: PushSender; store?: PushStore | null; now?: () => number; memberIds?: (householdId: string) => Promise<string[]> }

async function householdMemberIds(householdId: string): Promise<string[]> {
  const db = getServerDb()
  if (!db) return []
  const { data, error } = await db.from("household_members").select("user_id").eq("household_id", householdId)
  if (error) throw new Error(`loading members: ${error.message}`)
  return data.map((row) => row.user_id)
}

async function displayName(userId: string): Promise<string> {
  const { data } = (await getServerDb()?.from("profiles").select("display_name").eq("id", userId).maybeSingle()) ?? {}
  return data?.display_name?.trim() || "A housemate"
}

/**
 * A housemate added to the shopping list. Tells everyone else in the household. One push per
 * person per five minutes, so adding ten things in a row buzzes once ("Sam added Milk"; it
 * can't wait to merge a count on serverless). Never throws.
 */
export async function notifyListAdded(
  householdId: string,
  actorId: string,
  firstItemName: string,
  deps: Deps = {},
): Promise<void> {
  try {
    const store = deps.store === undefined ? getPushStore() : deps.store
    if (!store) return
    const now = deps.now?.() ?? Date.now()
    // The actor claims the slot, so a burst of changes is one push for the whole household.
    const key = `list:${householdId}:${actorId}:${timeBucket(now)}`
    if (!(await store.claim(actorId, "list", key))) return
    const [members, name] = await Promise.all([(deps.memberIds ?? householdMemberIds)(householdId), displayName(actorId)])
    await deliverToUsers(
      members,
      { title: "Shopping list", body: `${name} added ${firstItemName}`, url: "/list", kind: "list" },
      { sender: deps.sender ?? getSender(), store, actorId },
    )
  } catch (error) {
    console.error("[push] list notification failed:", error instanceof Error ? error.message : "unknown error")
  }
}

/** Someone joined the household. Tells the people already in it. Never throws. */
export async function notifyJoined(householdId: string, newMemberId: string, deps: Deps = {}): Promise<void> {
  try {
    const store = deps.store === undefined ? getPushStore() : deps.store
    if (!store) return
    const now = deps.now?.() ?? Date.now()
    const key = `joined:${householdId}:${newMemberId}:${timeBucket(now)}`
    if (!(await store.claim(newMemberId, "joined", key))) return
    const [members, name] = await Promise.all([(deps.memberIds ?? householdMemberIds)(householdId), displayName(newMemberId)])
    await deliverToUsers(
      members,
      { title: "New housemate", body: `${name} joined your household`, url: "/household", kind: "joined" },
      { sender: deps.sender ?? getSender(), store, actorId: newMemberId },
    )
  } catch (error) {
    console.error("[push] join notification failed:", error instanceof Error ? error.message : "unknown error")
  }
}
