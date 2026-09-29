"use client"

import { CircleAlert, CookingPot, ListPlus, LoaderCircle, Undo2 } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { addListItems } from "@/features/list/actions"
import { callAction } from "@/lib/call-action"
import { displayName } from "@/features/pantry/display"
import { formatUnit } from "@/lib/units"
import { cn } from "@/lib/utils"

import { cookRecipe, undoCook } from "../actions"
import {
  haveLabel,
  initialChoices,
  ranOut,
  toDeductions,
  undoAmounts,
  type CookChoice,
  type CookLine,
  type CookResult,
} from "../cook"

type Done = { results: CookResult[]; undone: boolean }

/** "I cooked this": review what comes out of the pantry, then take it all out at once. */
export function CookSheet({ recipeId, title, lines }: { recipeId: number; title: string; lines: CookLine[] }) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const trackable = lines.some((line) => line.kind === "deduct" || line.kind === "check")

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full text-base"
        onClick={() => {
          setSession((n) => n + 1)
          setOpen(true)
        }}
        disabled={!trackable}
      >
        <CookingPot aria-hidden />
        I cooked this
      </Button>
      {!trackable ? (
        <p className="-mt-3 text-center text-xs text-muted-foreground">Nothing in this recipe is tracked in your pantry.</p>
      ) : null}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto w-full max-w-lg">
          {session > 0 ? (
            <CookContent key={session} recipeId={recipeId} title={title} lines={lines} close={() => setOpen(false)} />
          ) : (
            <DrawerTitle className="sr-only">I cooked this</DrawerTitle>
          )}
        </DrawerContent>
      </Drawer>
    </>
  )
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

function CookContent({
  recipeId,
  title,
  lines,
  close,
}: {
  recipeId: number
  title: string
  lines: CookLine[]
  close: () => void
}) {
  const [choices, setChoices] = useState(() => initialChoices(lines))
  const [showErrors, setShowErrors] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, startTransition] = useTransition()

  const tracked = lines.filter((line): line is Extract<CookLine, { kind: "deduct" | "check" }> =>
    line.kind === "deduct" || line.kind === "check",
  )
  const untracked = lines.filter((line) => line.kind === "untracked")
  const notInPantry = lines.filter((line) => line.kind === "missing" || line.kind === "basic")
  const { deductions, errors } = toDeductions(lines, choices)
  const shownErrors = showErrors ? errors : {}

  function set(index: number, patch: Partial<CookChoice>) {
    setChoices((current) => ({ ...current, [index]: { ...current[index], ...patch } }))
  }

  function undo(results: CookResult[]) {
    const amounts = undoAmounts(results)
    if (amounts.length === 0) return
    startTransition(async () => {
      const result = await callAction(() => undoCook(amounts))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setDone((current) => (current ? { ...current, undone: true } : current))
      toast.success("Put everything back in the pantry")
    })
  }

  function confirm() {
    if (pending) return
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    if (deductions.length === 0) return
    startTransition(async () => {
      const result = await callAction(() => cookRecipe(recipeId, title, deductions))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setDone({ results: result.results, undone: false })
      toast.success(`Cooked ${title}`, {
        description: `Took ${plural(undoAmounts(result.results).length, "item")} out of the pantry`,
        action: { label: "Undo", onClick: () => undo(result.results) },
      })
    })
  }

  if (done) return <CookDone title={title} done={done} pending={pending} onUndo={() => undo(done.results)} close={close} />

  return (
    <>
      <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">What did you use?</DrawerTitle>
        <DrawerDescription>We&apos;ll take these out of the pantry. Fix an amount or skip anything you didn&apos;t use.</DrawerDescription>
      </DrawerHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain px-4 pb-2" data-vaul-no-drag>
        <ul className="grid grid-cols-1 gap-3" aria-label="From the pantry">
          {tracked.map((line) => (
            <CookLineCard
              key={line.index}
              line={line}
              choice={choices[line.index]}
              error={shownErrors[line.index]}
              disabled={pending}
              onChange={(patch) => set(line.index, patch)}
            />
          ))}
        </ul>
        {untracked.length > 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Always on hand:</span>{" "}
            {untracked.map((line) => (line.kind === "untracked" ? line.itemName : line.name)).join(", ")}. Nothing to take out.
          </p>
        ) : null}
        {notInPantry.length > 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Not in your pantry:</span>{" "}
            {notInPantry.map((line) => line.name).join(", ")}.
          </p>
        ) : null}
      </div>
      <DrawerFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" size="lg" className="h-12 text-base" onClick={confirm} disabled={pending || deductions.length === 0}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {pending
            ? "Taking it out…"
            : deductions.length === 0
              ? "Nothing to take out"
              : `Take ${plural(deductions.length, "item")} out of the pantry`}
        </Button>
      </DrawerFooter>
    </>
  )
}

function CookLineCard({
  line,
  choice,
  error,
  disabled,
  onChange,
}: {
  line: Extract<CookLine, { kind: "deduct" | "check" }>
  choice: CookChoice | undefined
  error: string | undefined
  disabled: boolean
  onChange: (patch: Partial<CookChoice>) => void
}) {
  const id = useId()
  const skipped = choice?.skip ?? true
  const unit = formatUnit(line.itemUnit, 2)
  return (
    <li className={cn("grid gap-2 rounded-xl border bg-card p-3", skipped && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className={cn("font-medium", skipped && "text-muted-foreground")}>{displayName(line.itemName)}</span>
          <span className="text-xs text-muted-foreground">
            Recipe: {line.original} · {haveLabel(line)}
          </span>
        </div>
        <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Skip</span>
          <Switch
            checked={skipped}
            onCheckedChange={(skip) => onChange({ skip })}
            disabled={disabled}
            aria-label={`Skip ${line.itemName}`}
          />
        </label>
      </div>
      {line.kind === "check" ? (
        <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Check this: {line.reason} Enter how much you used.</span>
        </p>
      ) : null}
      {!skipped ? (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-amount`} className="text-sm text-muted-foreground">
            Take out
          </label>
          <Input
            id={`${id}-amount`}
            value={choice?.amount ?? ""}
            onChange={(event) => onChange({ amount: event.target.value })}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Amount"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            disabled={disabled}
            className="w-24 tabular-nums"
          />
          <span className="text-sm">{unit || "items"}</span>
        </div>
      ) : null}
      {error && !skipped ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  )
}

function CookDone({
  title,
  done,
  pending,
  onUndo,
  close,
}: {
  title: string
  done: Done
  pending: boolean
  onUndo: () => void
  close: () => void
}) {
  const out = ranOut(done.results)
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const [adding, startAdding] = useTransition()
  const remaining = out.filter((item) => !added.has(item.id))

  function addToList(items: { id: string; name: string }[]) {
    if (items.length === 0) return
    startAdding(async () => {
      const result = await callAction(() =>
        addListItems(items.map((item) => ({ name: item.name, quantity: null, unit: null }))),
      )
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded((current) => new Set([...current, ...items.map((item) => item.id)]))
      toast.success(items.length === 1 ? `Added ${items[0].name} to the shopping list` : `Added ${items.length} items to the shopping list`)
    })
  }

  return (
    <>
      <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">{done.undone ? "Put back" : `Enjoy your ${title}`}</DrawerTitle>
        <DrawerDescription>
          {done.undone
            ? "Everything went back in the pantry."
            : `Took ${plural(undoAmounts(done.results).length, "item")} out of the pantry.`}
        </DrawerDescription>
      </DrawerHeader>
      <div className="grid gap-3 px-4 pb-2">
        {!done.undone && out.length > 0 ? (
          <section className="grid gap-2" aria-label="Ran out">
            <h3 className="text-sm font-semibold">You ran out of</h3>
            <ul className="divide-y rounded-xl border bg-card">
              {out.map((item) => (
                <li key={item.id} className="flex min-h-12 items-center gap-2 pr-2 pl-3.5">
                  <span className="min-w-0 flex-1 truncate">{displayName(item.name)}</span>
                  {added.has(item.id) ? (
                    <span className="text-sm text-muted-foreground">On the list</span>
                  ) : (
                    <Button type="button" variant="outline" className="h-11" disabled={adding} onClick={() => addToList([item])}>
                      <ListPlus aria-hidden /> Add to list
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {remaining.length > 1 ? (
              <Button type="button" variant="secondary" className="h-11" disabled={adding} onClick={() => addToList(remaining)}>
                Add all {remaining.length} to the list
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
      <DrawerFooter className="flex-row border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {!done.undone ? (
          <Button type="button" variant="outline" size="lg" className="h-12" onClick={onUndo} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
            Undo
          </Button>
        ) : null}
        <Button type="button" size="lg" className="h-12 flex-1 text-base" onClick={close}>
          Done
        </Button>
      </DrawerFooter>
    </>
  )
}
