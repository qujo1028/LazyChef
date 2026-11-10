"use client"

import { ScanBarcode, X } from "lucide-react"

import { useAiConsent } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { ingredientEmoji } from "@/lib/ingredients/emoji"

import { BarcodeScanner } from "./barcode-scanner"
import { ScanRows } from "./scan-rows"
import { TidyScanName } from "./tidy-scan-name"
import { useBarcodeLookups } from "./use-barcode-lookups"

/** A scanned item headed for the add-food review. */
export type ScannedLine = { code: string; line: string; quantity: number | null; unit: string }

/** Pantry: scan everything in the bag, then send it all to the usual review. */
export function ScanToAddSheet({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (lines: ScannedLine[]) => void
}) {
  const { rows, scan, retry, name, rename, remove, clear } = useBarcodeLookups()
  // For "Tidy name with AI", which lookups offer only when the AI assistant is set up.
  const { ensureConsent, dialog } = useAiConsent("the product's name, brand, categories and size (nothing about you)")
  const found = rows.flatMap((row) => (row.status === "found" ? [row.hit] : []))
  const looking = rows.some((row) => row.status === "looking")

  function done() {
    // Oldest first, the order they came out of the bag.
    onDone(
      [...found].reverse().map((hit) => ({ code: hit.code, line: hit.line, quantity: hit.quantity, unit: hit.unit })),
    )
    clear()
    onOpenChange(false)
  }

  return (
    <BarcodeScanner
      open={open}
      onOpenChange={onOpenChange}
      title="Scan your groceries"
      description="Point at each barcode. You'll check everything before it's added."
      onCode={scan}
      footer={
        <Button size="lg" className="h-12 w-full text-base" onClick={done} disabled={found.length === 0 || looking}>
          <ScanBarcode aria-hidden />
          {found.length === 0 ? "Scan something first" : found.length === 1 ? "Review 1 item" : `Review ${found.length} items`}
        </Button>
      }
    >
      <ScanRows
        rows={rows}
        empty="Nothing scanned yet."
        onRetry={retry}
        onName={name}
        onRemove={remove}
        renderFound={(row, hit) => (
          <>
            <div className="flex items-center gap-2.5">
              <span className="text-xl leading-none" aria-hidden>
                {ingredientEmoji(hit.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{hit.line}</p>
                {hit.label.toLowerCase() !== hit.name ? (
                  <p className="truncate text-xs text-muted-foreground">{hit.label}</p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(row.key)} aria-label={`Remove ${hit.name}`}>
                <X aria-hidden />
              </Button>
            </div>
            {hit.tidy ? (
              <TidyScanName key={hit.code} hit={hit} ensureConsent={ensureConsent} onAccept={(scan) => rename(hit.code, scan)} />
            ) : null}
          </>
        )}
      />
      {dialog}
    </BarcodeScanner>
  )
}
