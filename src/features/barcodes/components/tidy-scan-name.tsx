"use client"

import { LoaderCircle, SparklesIcon } from "lucide-react"
import { useId, useState } from "react"

import { AiLabel } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cleanScanName, scanLine } from "@/lib/barcode/product"
import { callAction } from "@/lib/call-action"

import { tidyScannedName } from "../ai/actions"
import type { TidySuggestion } from "../ai/prompt"
import type { ScanHit } from "../types"

type State =
  | { kind: "idle"; error?: string }
  | { kind: "asking" }
  | { kind: "dismissed" }
  | { kind: "suggested"; suggestion: TidySuggestion; draft: string }

/**
 * "Tidy name with AI" under a messy scanned name ("KRFT MAC&CHS ORIG 7.25OZ"): asks for a cleaner
 * one, which the person can edit, then accept or ignore. Accepting renames the scan, so the item
 * is added (and its barcode remembered) under the tidy name, and the next scan needs no AI.
 */
export function TidyScanName({
  hit,
  ensureConsent,
  onAccept,
}: {
  hit: ScanHit
  ensureConsent: () => Promise<boolean>
  onAccept: (scan: Pick<ScanHit, "name" | "quantity" | "unit" | "line">) => void
}) {
  const id = useId()
  const [state, setState] = useState<State>({ kind: "idle" })

  async function ask() {
    if (!(await ensureConsent())) return
    setState({ kind: "asking" })
    const result = await callAction(() => tidyScannedName(hit.code))
    if (result.error !== undefined) setState({ kind: "idle", error: result.error })
    else
      setState({
        kind: "suggested",
        suggestion: result.suggestion,
        draft: result.suggestion.name,
      })
  }

  if (state.kind === "dismissed") return null
  if (state.kind !== "suggested") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-8">
        <Button type="button" variant="outline" size="sm" onClick={ask} disabled={state.kind === "asking"}>
          {state.kind === "asking" ? (
            <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
          ) : (
            <SparklesIcon data-icon="inline-start" aria-hidden />
          )}
          {state.kind === "asking" ? "Tidying…" : "Tidy name with AI"}
        </Button>
        {state.kind === "idle" && state.error ? (
          <p className="text-xs text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
    )
  }

  const { suggestion, draft } = state
  const name = cleanScanName(draft)
  const scan = { name, quantity: suggestion.quantity, unit: suggestion.unit }
  return (
    <form
      className="grid gap-2 pl-8"
      onSubmit={(event) => {
        event.preventDefault()
        // The scanner sheet sits inside the Add groceries form; React bubbles submit through the
        // portal, so without this "Use" would also submit that form.
        event.stopPropagation()
        if (!name) return
        onAccept({ ...scan, line: scanLine(scan) })
      }}
    >
      <div className="flex items-center gap-2">
        <AiLabel />
        {name ? <span className="truncate text-xs text-muted-foreground">Adds “{scanLine(scan)}”</span> : null}
      </div>
      <label htmlFor={id} className="sr-only">
        Tidy name for {hit.label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setState({ ...state, draft: event.target.value })}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={80}
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={!name}>
          Use
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestion.ingredient && suggestion.ingredient !== name ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setState({ ...state, draft: suggestion.ingredient ?? draft })}
          >
            Use “{suggestion.ingredient}”
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setState({ kind: "dismissed" })}>
          Keep “{hit.name}”
        </Button>
      </div>
    </form>
  )
}
