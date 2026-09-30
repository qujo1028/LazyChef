"use client"

import { LoaderCircle, Pencil, ScanBarcode } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { FormMessage } from "@/components/form-message"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { barcodeMemories, type ScanPackage } from "@/features/barcodes/memory"
import { ScanToAddSheet, type ScannedLine } from "@/features/barcodes/components/scan-to-add-sheet"
import { parseLine, parseLines } from "@/lib/ingredients/parse-line"

import { addItems, previewItems } from "../actions"
import { describeAdditions } from "../merge"
import type { SpoonacularStatus } from "../resolve-core"
import { draftsFromResolved, draftToItem, draftsToItems, type ReviewDraft } from "../review"
import { callAction } from "@/lib/call-action"
import { ReviewList, SpoonacularNote } from "./review-list"
import { useToday } from "./use-clock"

const PLACEHOLDER = ["2 lbs chicken breast", "1 dozen eggs", "milk", "3 cans black beans", "a bunch of cilantro"].join("\n")

/** /pantry/add: paste, type or scan a whole haul, check it, add it in one go. */
export function BulkAddForm({
  defaultText,
  serverToday,
  startScanning = false,
}: {
  defaultText: string
  serverToday: string
  /** Open the barcode scanner right away (?scan=1, from the quick add sheet). */
  startScanning?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const today = useToday(serverToday)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const batch = useRef(0)
  const [text, setText] = useState(defaultText)
  const [review, setReview] = useState<{ drafts: ReviewDraft[]; spoonacular: SpoonacularStatus } | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [scanning, setScanning] = useState(startScanning)
  // Scanned lines (as parseLine reads them) → their barcode, and each code's package size.
  const scannedLines = useRef(new Map<string, string>())
  const packages = useRef(new Map<string, ScanPackage>())

  const count = useMemo(() => (text.trim() ? parseLines(text).length : 0), [text])
  const drafts = review?.drafts ?? []

  function preview(event: React.FormEvent) {
    event.preventDefault()
    runPreview(text)
  }

  function runPreview(text: string) {
    if (pending) return
    const count = text.trim() ? parseLines(text).length : 0
    if (count === 0) {
      setError("Type what you bought first, one item per line.")
      textareaRef.current?.focus()
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await callAction(() => previewItems(text))
      if (result.error !== undefined) {
        setError(result.error)
        return
      }
      batch.current += 1
      setShowErrors(false)
      const drafts = draftsFromResolved(result.items, batch.current).map((draft, i) => {
        const barcode = scannedLines.current.get(result.items[i].raw)
        return barcode ? { ...draft, barcode } : draft
      })
      setReview({ drafts, spoonacular: result.spoonacular })
      window.scrollTo({ top: 0 })
    })
  }

  function add() {
    if (pending) return
    const items = draftsToItems(drafts)
    if (!items) {
      setShowErrors(true)
      toast.error("A few items need fixing first.")
      return
    }
    startTransition(async () => {
      const scanned = drafts.flatMap((draft) => {
        const item = draft.barcode ? draftToItem(draft) : null
        return item && draft.barcode ? [{ code: draft.barcode, name: item.name, quantity: item.quantity, unit: item.unit }] : []
      })
      const barcodes = barcodeMemories(scanned, packages.current)
      const result = await callAction(() => addItems(items, barcodes))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      toast.success(describeAdditions(result))
      // Its own transition (updates after an await aren't part of the first one), so the
      // button stays disabled until /pantry shows instead of re-enabling mid-navigation.
      startTransition(() => router.replace("/pantry"))
    })
  }

  /** Scans go into the box as lines ("24 eggs"), then straight to the review. */
  function addScanned(lines: ScannedLine[]) {
    if (lines.length === 0) return
    for (const scan of lines) {
      const raw = parseLine(scan.line)?.raw
      if (raw) scannedLines.current.set(raw, scan.code)
      packages.current.set(scan.code, { quantity: scan.quantity, unit: scan.unit })
    }
    const next = [text.trimEnd(), ...lines.map((scan) => scan.line)].filter(Boolean).join("\n")
    setText(next)
    setError(null)
    runPreview(next)
  }

  function editText() {
    setReview(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  if (review) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {drafts.length === 1 ? "Check 1 item" : `Check ${drafts.length} items`}
          </h2>
          <Button variant="ghost" className="h-11" onClick={editText} disabled={pending}>
            <Pencil aria-hidden />
            Edit list
          </Button>
        </div>
        <SpoonacularNote status={review.spoonacular} />
        <ReviewList
          drafts={drafts}
          onChange={(next) => {
            if (next.length === 0) editText()
            else setReview({ ...review, drafts: next })
          }}
          today={today}
          showErrors={showErrors}
          disabled={pending}
        />
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-20">
          <Button size="lg" className="h-12 w-full text-base shadow-lg" onClick={add} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {pending ? "Adding…" : drafts.length === 1 ? "Add 1 item" : `Add ${drafts.length} items`}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={preview} className="grid grid-cols-1 gap-3" noValidate>
      <Button type="button" variant="outline" size="lg" className="h-12 text-base" onClick={() => setScanning(true)} disabled={pending}>
        <ScanBarcode aria-hidden />
        Scan barcodes
      </Button>
      <ScanToAddSheet open={scanning} onOpenChange={setScanning} onDone={addScanned} />
      <Label htmlFor={`${id}-text`}>What did you get?</Label>
      <Textarea
        ref={textareaRef}
        id={`${id}-text`}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          if (error) setError(null)
        }}
        placeholder={PLACEHOLDER}
        rows={8}
        maxLength={5000}
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
        className="min-h-52 px-3 py-2.5 text-base leading-relaxed md:text-base"
      />
      <p id={`${id}-hint`} className="px-1 text-sm text-muted-foreground" aria-live="polite">
        {count > 0
          ? `${count} ${count === 1 ? "item" : "items"}. Amounts are optional.`
          : "One item per line (or separate with commas). Amounts are optional."}
      </p>
      <FormMessage error={error ?? undefined} />
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? "Reading your list…" : count > 1 ? `Review ${count} items` : "Review"}
      </Button>
    </form>
  )
}
