"use client"

import { ArrowLeft, ArrowLeftRight, CircleAlert, LoaderCircle, Package } from "lucide-react"
import { useRef, useState } from "react"

import { AiLabel, useAiConsent } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { displayName } from "@/features/pantry/display"
import { callAction } from "@/lib/call-action"

import { IngredientChecklist, type ChecklistLine } from "../../components/ingredient-checklist"
import { suggestSubstitutions, type SubstitutionResult } from "../actions"

type Answer = { status: "loading" } | { status: "error"; error: string } | { status: "done"; result: SubstitutionResult }

/**
 * The ingredient checklist plus "What can I use instead?": a swap button on each missing
 * ingredient and a "Missing something?" button that lets you pick any of them. Answers are
 * kept for as long as the page is open, so asking twice doesn't spend another AI request.
 */
export function IngredientsWithSwaps({
  recipeId,
  title,
  lines,
  sendCopy,
}: {
  recipeId: string
  title: string
  lines: ChecklistLine[]
  /**
   * Send the page's copy of the recipe along (Spoonacular's recipes only): the server uses it
   * only if its hour-long cache has expired, rather than spending a point to fetch it again.
   */
  sendCopy: boolean
}) {
  const { ensureConsent, dialog } = useAiConsent("this recipe's title and ingredients and the names of the items in your pantry")
  const consented = useRef(false)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ChecklistLine | null>(null)
  const [answers, setAnswers] = useState<ReadonlyMap<number, Answer>>(() => new Map())

  async function consent() {
    if (consented.current) return true
    consented.current = await ensureConsent()
    return consented.current
  }

  function setAnswer(index: number, answer: Answer) {
    setAnswers((current) => new Map(current).set(index, answer))
  }

  async function ask(line: ChecklistLine) {
    setTarget(line)
    const existing = answers.get(line.index)
    if (existing && existing.status !== "error") return
    setAnswer(line.index, { status: "loading" })
    const fallback = sendCopy
      ? {
          title,
          ingredients: [...lines]
            .sort((a, b) => a.index - b.index)
            .map((l) => ({ original: l.original, name: l.name })),
        }
      : undefined
    const result = await callAction(() => suggestSubstitutions({ ref: recipeId, index: line.index, fallback }))
    setAnswer(
      line.index,
      result.error !== undefined ? { status: "error", error: result.error } : { status: "done", result },
    )
  }

  async function openFor(line: ChecklistLine | null) {
    if (!(await consent())) return
    setTarget(null)
    setOpen(true)
    if (line) void ask(line)
  }

  const missing = lines.filter((line) => line.status === "need")
  const picks = [...missing, ...lines.filter((line) => line.status !== "need")]

  return (
    <>
      <IngredientChecklist recipeId={recipeId} lines={lines} onSwap={(line) => void openFor(line)} />
      <Button type="button" variant="ghost" size="lg" className="-mt-1 h-11 w-full" onClick={() => void openFor(null)}>
        <ArrowLeftRight aria-hidden /> Missing something?
      </Button>
      {dialog}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto w-full max-w-lg">
          {target === null ? (
            <>
              <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
                <DrawerTitle className="text-lg">What are you missing?</DrawerTitle>
                <DrawerDescription>Pick an ingredient to see what you could use instead.</DrawerDescription>
              </DrawerHeader>
              <ul
                className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                data-vaul-no-drag
              >
                {picks.map((line) => (
                  <li key={line.index}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => void ask(line)}
                    >
                      <span className="min-w-0 flex-1 break-words">{line.original}</span>
                      {line.status === "need" ? (
                        <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">Missing</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <SwapAnswer
              line={target}
              answer={answers.get(target.index) ?? { status: "loading" }}
              onBack={() => setTarget(null)}
              onRetry={() => void ask(target)}
            />
          )}
        </DrawerContent>
      </Drawer>
    </>
  )
}

function SwapAnswer({
  line,
  answer,
  onBack,
  onRetry,
}: {
  line: ChecklistLine
  answer: Answer
  onBack: () => void
  onRetry: () => void
}) {
  return (
    <>
      <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">Instead of {line.name}</DrawerTitle>
        <DrawerDescription className="break-words">{line.original}</DrawerDescription>
      </DrawerHeader>
      <div
        className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto overscroll-contain px-4 pb-2"
        data-vaul-no-drag
        aria-live="polite"
      >
        {answer.status === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Thinking of swaps…
          </p>
        ) : answer.status === "error" ? (
          <div className="grid gap-3 py-2">
            <p className="flex items-start gap-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> {answer.error}
            </p>
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div>
              <AiLabel />
            </div>
            {answer.result.swaps.length === 0 ? (
              <p className="text-sm">
                No good swap for this one.{answer.result.none ? ` ${answer.result.none}` : ""}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5">
                {answer.result.swaps.map((swap) => (
                  <li key={swap.use} className="grid gap-1 rounded-xl border bg-card px-3.5 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-medium break-words">{swap.use}</span>
                      {swap.pantryName ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Package className="size-3.5" aria-hidden /> In your pantry
                          {displayName(swap.pantryName).toLowerCase() !== swap.use.toLowerCase()
                            ? ` (${displayName(swap.pantryName).toLowerCase()})`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm break-words">{swap.amount}</p>
                    <p className="text-sm break-words text-muted-foreground">{swap.note}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              AI suggestions can be wrong. Check swaps for allergens and dietary needs before you cook.
            </p>
          </>
        )}
      </div>
      <DrawerFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" size="lg" className="h-12 text-base" onClick={onBack}>
          <ArrowLeft aria-hidden /> Ask about another ingredient
        </Button>
      </DrawerFooter>
    </>
  )
}
