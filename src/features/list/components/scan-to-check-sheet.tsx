"use client"

import { CircleCheck, ListPlus, LoaderCircle, Undo2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { rememberBarcode } from "@/features/barcodes/actions"
import { BarcodeScanner } from "@/features/barcodes/components/barcode-scanner"
import { ScanRows } from "@/features/barcodes/components/scan-rows"
import { useBarcodeLookups } from "@/features/barcodes/components/use-barcode-lookups"
import type { ScanHit } from "@/features/barcodes/types"
import { displayName } from "@/features/pantry/display"
import { callAction } from "@/lib/call-action"

import { addListItems, setChecked } from "../actions"
import type { ListChange } from "../list-state"
import { findListLine } from "../scan-match"
import type { ListItem } from "../types"

type Outcome =
  | { kind: "checked"; id: string; name: string }
  | { kind: "not-on-list" }
  | { kind: "adding" }
  | { kind: "added"; id: string }

/** At the store: scan what goes in the cart, and the matching line is checked off. */
export function ScanToCheckSheet({
  open,
  onOpenChange,
  items,
  setItemChecked,
  apply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ReadonlyMap<string, ListItem>
  setItemChecked: (id: string, checked: boolean) => void
  apply: (change: ListChange) => void
}) {
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, Outcome>>(() => new Map())
  const latest = useRef(items)
  useEffect(() => {
    latest.current = items
  }, [items])

  const record = useCallback((key: number, outcome: Outcome) => {
    setOutcomes((current) => new Map(current).set(key, outcome))
  }, [])

  const onFound = useCallback(
    (key: number, hit: ScanHit) => {
      const line = findListLine(latest.current.values(), hit.name)
      if (!line) {
        record(key, { kind: "not-on-list" })
        return
      }
      setItemChecked(line.id, true)
      record(key, { kind: "checked", id: line.id, name: line.name })
    },
    [record, setItemChecked],
  )

  const { rows, scan, retry, name, remove, clear } = useBarcodeLookups({ onFound })

  function nameIt(key: number, code: string, typed: string) {
    name(key, code, typed)
    // The product database didn't know it: remember the household's name for next time.
    void callAction(() => rememberBarcode({ code, name: typed.trim(), quantity: null, unit: "count" }))
  }

  async function addAndCheck(key: number, hit: ScanHit) {
    record(key, { kind: "adding" })
    const added = await callAction(() =>
      addListItems([{ name: hit.name, quantity: hit.quantity, unit: hit.quantity === null ? null : hit.unit }]),
    )
    const id = added.error === undefined ? added.ids[0] : undefined
    if (added.error !== undefined || !id) {
      toast.error(added.error ?? "Couldn't add it. Try again.")
      record(key, { kind: "not-on-list" })
      return
    }
    const checked = await callAction(() => setChecked(id, true))
    if (checked.error === undefined) apply({ type: "upsert", item: checked.item })
    record(key, { kind: "added", id })
  }

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) {
      clear()
      setOutcomes(new Map())
    }
  }

  const checkedCount = [...outcomes.values()].filter((o) => o.kind === "checked" || o.kind === "added").length

  return (
    <BarcodeScanner
      open={open}
      onOpenChange={close}
      title="Scan into the cart"
      description="Scan each thing as it goes in the cart. Matching lines get checked off for everyone."
      onCode={scan}
      footer={
        <Button size="lg" className="h-12 w-full text-base" onClick={() => close(false)}>
          {checkedCount === 0 ? "Done" : checkedCount === 1 ? "Done · 1 checked off" : `Done · ${checkedCount} checked off`}
        </Button>
      }
    >
      <ScanRows
        rows={rows}
        empty="Nothing scanned yet."
        onRetry={retry}
        onName={nameIt}
        onRemove={remove}
        renderFound={(row, hit) => {
          const outcome = outcomes.get(row.key)
          if (outcome?.kind === "checked") {
            const stillChecked = items.get(outcome.id)?.checked_at != null
            return (
              <div className="flex items-center gap-2">
                <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
                <p className="min-w-0 flex-1 truncate text-sm">
                  {stillChecked ? "Checked off" : "Put back on the list:"}{" "}
                  <span className="font-medium">{displayName(outcome.name).toLowerCase()}</span>
                </p>
                {stillChecked ? (
                  <Button type="button" variant="ghost" className="h-11" onClick={() => setItemChecked(outcome.id, false)}>
                    <Undo2 aria-hidden /> Undo
                  </Button>
                ) : null}
              </div>
            )
          }
          if (outcome?.kind === "added") {
            return (
              <div className="flex items-center gap-2">
                <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
                <p className="min-w-0 flex-1 truncate text-sm">
                  Added and checked off <span className="font-medium">{hit.name}</span>
                </p>
              </div>
            )
          }
          return (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  Not on your list: <span className="font-medium">{hit.name}</span>
                </p>
                {hit.label.toLowerCase() !== hit.name ? (
                  <p className="truncate text-xs text-muted-foreground">{hit.label}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                disabled={outcome?.kind === "adding"}
                onClick={() => addAndCheck(row.key, hit)}
              >
                {outcome?.kind === "adding" ? <LoaderCircle className="animate-spin" aria-hidden /> : <ListPlus aria-hidden />}
                Add
              </Button>
            </div>
          )
        }}
      />
    </BarcodeScanner>
  )
}
