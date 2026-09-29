"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { useHouseholdChanges } from "@/features/household/components/household-channel"

import { adjustQuantity } from "../actions"
import {
  applyOverrides,
  beginAdjust,
  changeFromBroadcast,
  endAdjust,
  initialPantryState,
  reducePantry,
  type PantryChange,
  type PantryItems,
  type QuantityOverrides,
} from "../pantry-state"
import type { PantryItem } from "../types"
import { callAction } from "@/lib/call-action"

export type AdjustOptions = {
  /** After the server confirms, with the new amount. */
  onDone?: (quantity: number) => void
}

/**
 * The pantry as the list shows it: the server's items, kept in sync with fresh server
 * renders (after any action) and housemates' live changes, plus our own optimistic edits.
 */
export function usePantry({
  householdId,
  serverItems,
  fetchedAt,
}: {
  householdId: string
  serverItems: PantryItem[]
  fetchedAt: number
}) {
  const [state, setState] = useState(() => initialPantryState(serverItems))
  const [synced, setSynced] = useState(serverItems)
  const [overrides, setOverrides] = useState<QuantityOverrides>(() => new Map())
  const [, startTransition] = useTransition()

  // A new server render (revalidatePath after an action, a refresh): merge it in.
  if (synced !== serverItems) {
    setSynced(serverItems)
    setState((current) => reducePantry(current, { type: "sync", items: serverItems, fetchedAt }))
  }

  const apply = useCallback((change: PantryChange) => setState((current) => reducePantry(current, change)), [])

  useHouseholdChanges("pantry_items", (broadcast) => {
    const change = changeFromBroadcast(broadcast, householdId)
    if (change) apply(change)
  })

  const items: PantryItems = useMemo(() => applyOverrides(state.items, overrides), [state.items, overrides])

  // Event handlers read the latest items without re-creating callbacks.
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])

  /** Changes an amount by `delta` (e.g. -1), showing it right away. */
  const adjust = useCallback(
    (id: string, delta: number, options: AdjustOptions = {}) => {
      const item = latest.current.get(id)
      if (!item) return
      setOverrides((current) => beginAdjust(current, id, (item.quantity ?? 0) + delta))
      startTransition(async () => {
        const result = await callAction(() => adjustQuantity(id, delta))
        // The full row carries the new updated_at, so an older snapshot can't win over it.
        if (result.error === undefined) apply({ type: "upsert", item: result.item })
        setOverrides((current) => endAdjust(current, id))
        if (result.error !== undefined) toast.error(result.error)
        else options.onDone?.(Number(result.item.quantity ?? 0))
      })
    },
    [apply],
  )

  return { items, apply, adjust }
}
