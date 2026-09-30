"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { useHouseholdChanges } from "@/features/household/components/household-channel"
import { callAction } from "@/lib/call-action"
import { displayName } from "@/features/pantry/display"

import { setChecked } from "../actions"
import {
  applyChecked,
  beginCheck,
  endCheck,
  initialListState,
  listChangeFromBroadcast,
  reduceList,
  type CheckedOverrides,
  type ListChange,
  type ListItems,
} from "../list-state"
import type { ListItem } from "../types"

/**
 * The list as the screen shows it: the server's lines, kept in sync with fresh server
 * renders (after any action) and housemates' live changes, plus our own optimistic checks.
 */
export function useList({
  householdId,
  viewerId,
  serverItems,
  fetchedAt,
}: {
  householdId: string
  viewerId: string
  serverItems: ListItem[]
  fetchedAt: number
}) {
  const [state, setState] = useState(() => initialListState(serverItems))
  const [synced, setSynced] = useState(serverItems)
  const [overrides, setOverrides] = useState<CheckedOverrides>(() => new Map())
  const [, startTransition] = useTransition()

  // A new server render (revalidatePath after an action, a refresh): merge it in.
  if (synced !== serverItems) {
    setSynced(serverItems)
    setState((current) => reduceList(current, { type: "sync", items: serverItems, fetchedAt }))
  }

  const apply = useCallback((change: ListChange) => setState((current) => reduceList(current, change)), [])

  useHouseholdChanges("shopping_list_items", (broadcast) => {
    const change = listChangeFromBroadcast(broadcast, householdId)
    if (change) apply(change)
  })

  const items: ListItems = useMemo(() => applyChecked(state.items, overrides, viewerId), [state.items, overrides, viewerId])

  // Event handlers read the latest items without re-creating callbacks.
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])

  /** Checks a line off (or back on) right away; the server catches up. */
  const setItemChecked = useCallback(
    (id: string, checked: boolean) => {
      const item = latest.current.get(id)
      if (!item || (item.checked_at !== null) === checked) return
      setOverrides((current) => beginCheck(current, id, checked ? new Date().toISOString() : null))
      startTransition(async () => {
        const result = await callAction(() => setChecked(id, checked))
        if (result.error === undefined) apply({ type: "upsert", item: result.item })
        setOverrides((current) => endCheck(current, id))
        if (result.error !== undefined) toast.error(result.error, { id: `check-${id}` })
      })
    },
    [apply],
  )

  /** Tap on a line: checks it off (with Undo) or back on. */
  const toggle = useCallback(
    (id: string) => {
      const item = latest.current.get(id)
      if (!item) return
      const checking = item.checked_at === null
      setItemChecked(id, checking)
      if (checking) {
        toast.success(`Checked off ${displayName(item.name).toLowerCase()}`, {
          id: `check-${id}`,
          action: { label: "Undo", onClick: () => setItemChecked(id, false) },
        })
      }
    },
    [setItemChecked],
  )

  return { items, apply, toggle, setItemChecked }
}
