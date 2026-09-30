"use client"

import { CircleAlert, LoaderCircle, RotateCw, X } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import type { ScanHit } from "../types"
import type { ScanRow } from "./use-barcode-lookups"

function NameIt({ code, onName }: { code: string; onName: (name: string) => void }) {
  const id = useId()
  const [value, setValue] = useState("")
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onName(value)
      }}
    >
      <label htmlFor={id} className="sr-only">
        What is barcode {code}?
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="What is it? e.g. oat milk"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={80}
        className="h-11 text-base"
      />
      <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={!value.trim()}>
        Save
      </Button>
    </form>
  )
}

/**
 * What was scanned, newest first. Looking up, not found (name it by hand, and it's
 * remembered), and errors look the same everywhere; `renderFound` draws the rest.
 */
export function ScanRows({
  rows,
  renderFound,
  onRetry,
  onName,
  onRemove,
  empty,
}: {
  rows: ScanRow[]
  renderFound: (row: ScanRow & { status: "found" }, hit: ScanHit) => React.ReactNode
  onRetry: (key: number, code: string) => void
  onName: (key: number, code: string, name: string) => void
  onRemove: (key: number) => void
  empty: string
}) {
  if (rows.length === 0) return <p className="px-1 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y rounded-xl border bg-card" aria-live="polite" aria-label="Scanned">
      {rows.map((row) => (
        <li key={row.key} className="grid min-h-14 gap-2 py-2 pr-1.5 pl-3.5">
          {row.status === "found" ? (
            renderFound(row, row.hit)
          ) : (
            <div className="flex items-center gap-2">
              {row.status === "looking" ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {row.status === "looking"
                    ? "Looking it up…"
                    : row.status === "missing"
                      ? "Not in the product database"
                      : row.message}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
              </div>
              {row.status === "error" ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => onRetry(row.key, row.code)} aria-label="Try again">
                  <RotateCw aria-hidden />
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(row.key)} aria-label={`Remove ${row.code}`}>
                <X aria-hidden />
              </Button>
            </div>
          )}
          {row.status === "missing" ? <NameIt code={row.code} onName={(name) => onName(row.key, row.code, name)} /> : null}
        </li>
      ))}
    </ul>
  )
}
