"use client"

import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { useAiConsent } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isAiLimited } from "@/features/pro/ai-allowance-core"
import { AiLimitNotice } from "@/features/pro/components/ai-limit-notice"
import { callAction } from "@/lib/call-action"

import { getAiRecipeIdea, type AiIdea } from "./actions"
import { AiRecipeSheet } from "./ai-recipe-sheet"
import { MAX_HINT_LENGTH } from "./limits"

/**
 * "Ask AI for an idea": one simple recipe from what's in the pantry. Only rendered when the AI
 * assistant is set up. The idea isn't saved anywhere; closing the sheet lets it go.
 */
export function AiIdeaCard() {
  const hintId = useId()
  const [hint, setHint] = useState("")
  const [idea, setIdea] = useState<AiIdea | null>(null)
  const [open, setOpen] = useState(false)
  const [asking, startAsking] = useTransition()
  const [limit, setLimit] = useState<string | null>(null)
  const { ensureConsent, dialog } = useAiConsent(
    "the names of the items in your pantry, your diet and allergies if you've set them, and any hint you type",
  )

  async function ask(avoidTitle?: string) {
    if (!(await ensureConsent())) return
    startAsking(async () => {
      const result = await callAction(() => getAiRecipeIdea(hint, avoidTitle))
      if (result.error !== undefined) {
        if (isAiLimited(result)) {
          setLimit(result.error)
          setOpen(false)
        } else toast.error(result.error)
        return
      }
      setLimit(null)
      setIdea({ recipe: result.recipe, missing: result.missing })
      setOpen(true)
    })
  }

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-label="Ask AI for an idea">
      <div className="grid gap-0.5">
        <h2 className="font-heading text-lg font-semibold">Stuck for ideas?</h2>
        <p className="text-sm text-muted-foreground">Get a simple recipe idea made from your pantry, using what expires first.</p>
      </div>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void ask()
        }}
      >
        <label htmlFor={hintId} className="sr-only">
          Optional hint
        </label>
        <Input
          id={hintId}
          value={hint}
          onChange={(event) => setHint(event.target.value)}
          maxLength={MAX_HINT_LENGTH}
          placeholder="Optional: quick, vegetarian, one pan…"
          autoComplete="off"
          enterKeyHint="go"
        />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={asking}>
          {asking ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {asking ? "Thinking…" : "Ask AI for an idea"}
        </Button>
      </form>
      {limit ? <AiLimitNotice message={limit} className="grid gap-2 rounded-xl bg-muted/50 p-3 text-sm" /> : null}
      {dialog}
      <AiRecipeSheet
        idea={idea}
        open={open}
        onOpenChange={setOpen}
        actions={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={asking || !idea}
              onClick={() => void ask(idea?.recipe.title)}
            >
              {asking ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
              Try another
            </Button>
            <Button type="button" size="lg" className="h-12 flex-1 text-base" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        }
      />
    </section>
  )
}
