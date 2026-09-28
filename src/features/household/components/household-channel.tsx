"use client"

import type { RealtimeChannel } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { createContext, useContext, useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type TableName = keyof Database["public"]["Tables"]
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"]

/** A row change broadcast by the database (see private.broadcast_household_change). */
export type HouseholdChange<T extends TableName> = {
  operation: "INSERT" | "UPDATE" | "DELETE"
  /** The new row (null for DELETE). */
  record: Row<T> | null
  /** The previous row (null for INSERT). */
  oldRecord: Row<T> | null
}

type Listener = (change: HouseholdChange<TableName>, table: TableName) => void

const ListenersContext = createContext<Set<Listener> | null>(null)

/** Tables whose changes re-render the page instead of being patched in place. */
const REFRESH_TABLES = new Set<string>(["households", "household_members"])

/**
 * One private Realtime channel per household (authorized by RLS on
 * realtime.messages). Membership changes refresh the page; other tables are
 * handed to whichever components subscribed with useHouseholdChanges().
 */
export function HouseholdChannelProvider({
  householdId,
  children,
}: {
  householdId: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [listeners] = useState(() => new Set<Listener>())

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | undefined
    let cancelled = false

    async function subscribe() {
      await supabase.realtime.setAuth()
      if (cancelled) return
      channel = supabase
        .channel(`household:${householdId}`, { config: { private: true } })
        .on("broadcast", { event: "*" }, ({ payload }) => {
          const table = payload?.table as TableName | undefined
          if (!table) return
          if (REFRESH_TABLES.has(table)) {
            router.refresh()
            return
          }
          const change = {
            operation: payload.operation,
            record: payload.record ?? null,
            oldRecord: payload.old_record ?? null,
          } as HouseholdChange<TableName>
          for (const listener of listeners) listener(change, table)
        })
        .subscribe()
    }
    void subscribe()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [householdId, router, listeners])

  return <ListenersContext.Provider value={listeners}>{children}</ListenersContext.Provider>
}

/** Calls `onChange` whenever a housemate (or you, on another device) changes a row in `table`. */
export function useHouseholdChanges<T extends TableName>(
  table: T,
  onChange: (change: HouseholdChange<T>) => void,
) {
  const listeners = useContext(ListenersContext)
  const latest = useRef(onChange)

  useEffect(() => {
    latest.current = onChange
  })

  useEffect(() => {
    if (!listeners) return
    const listener: Listener = (change, changedTable) => {
      if (changedTable === table) latest.current(change as unknown as HouseholdChange<T>)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [listeners, table])
}
