"use client"

import { ArrowRight, Check, Plus, Refrigerator } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CATEGORY_META } from "@/lib/ingredients/types"
import { cn } from "@/lib/utils"

import { addStaples } from "../actions"
import { displayName } from "../display"
import { describeAdditions } from "../merge"
import { COMMON_STAPLES } from "../staples"
import { callAction } from "@/lib/call-action"

/**
 * The empty pantry: what this is, a big "Add food" button, and one-tap kitchen basics.
 * Stays up (retitled) while the pantry only has staples, so tapping a few basics
 * doesn't whisk the rest away.
 */
export function GettingStarted({
  onlyStaples,
  existingNames,
  onAddFood,
}: {
  onlyStaples: boolean
  /** Lowercased names already in the pantry. */
  existingNames: ReadonlySet<string>
  onAddFood: () => void
}) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const [, startTransition] = useTransition()

  const isAdded = (name: string) => existingNames.has(name) || added.has(name)
  const remaining = COMMON_STAPLES.filter((staple) => !isAdded(staple.name) && !pending.has(staple.name)).map(
    (staple) => staple.name,
  )

  function add(names: string[]) {
    if (names.length === 0) return
    setPending((current) => new Set([...current, ...names]))
    startTransition(async () => {
      const result = await callAction(() => addStaples(names))
      setPending((current) => new Set([...current].filter((name) => !names.includes(name))))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setAdded((current) => new Set([...current, ...names]))
      toast.success(names.length === 1 ? `Added ${names[0]}` : describeAdditions(result))
    })
  }

  return (
    <div className="grid gap-5 rounded-2xl border border-dashed p-5">
      <div className="grid justify-items-center gap-3 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Refrigerator className="size-6" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">{onlyStaples ? "Now add your food" : "Your pantry is empty"}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Add what&apos;s in your fridge and cupboards, like &ldquo;2 lbs chicken breast&rdquo; or &ldquo;1 dozen
          eggs&rdquo;. Everyone in your household shares this pantry.
        </p>
        <Button size="lg" className="mt-1 h-12 w-full max-w-xs text-base" onClick={onAddFood}>
          <Plus className="size-5" aria-hidden />
          Add food
        </Button>
        <Link
          href="/pantry/add"
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Just went shopping? Add it all at once
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <Separator />

      <section aria-labelledby="kitchen-basics" className="grid gap-3">
        <div className="grid gap-1">
          <h3 id="kitchen-basics" className="text-sm font-semibold">
            Kitchen basics
          </h3>
          <p className="text-sm text-muted-foreground">
            Tap the ones you always have. They count for recipes and never need restocking here.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {COMMON_STAPLES.map((staple) => {
            const done = isAdded(staple.name)
            const busy = pending.has(staple.name)
            return (
              <li key={staple.name}>
                <button
                  type="button"
                  disabled={done || busy}
                  onClick={() => add([staple.name])}
                  aria-label={done ? `${displayName(staple.name)}, added` : `Add ${staple.name}`}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    done
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "bg-card hover:bg-muted active:bg-muted disabled:opacity-60",
                  )}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {CATEGORY_META[staple.category].emoji}
                  </span>
                  {displayName(staple.name)}
                  {done ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Plus className={cn("size-4 text-muted-foreground", busy && "animate-pulse")} aria-hidden />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {remaining.length > 1 ? (
          <Button variant="outline" className="h-11 justify-self-start" onClick={() => add(remaining)}>
            Add all {remaining.length}
          </Button>
        ) : null}
      </section>
    </div>
  )
}
