"use client"

import { BookmarkPlus, Clock, LoaderCircle, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { toast } from "sonner"

import { hasAiConsent, useAiConsent } from "@/components/ai/ai-consent"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { displayName } from "@/features/pantry/display"
import { callAction } from "@/lib/call-action"
import { cn } from "@/lib/utils"

import { RecipeGrid } from "../components/recipe-tile"
import { saveAiRecipe } from "../own-actions"
import { recipeHref } from "../ref"
import { AiRecipeSheet, type ShownIdea } from "./ai-recipe-sheet"
import { getMealIdeas } from "./meal-actions"
import {
  AI_BORDER_CLASS,
  AI_SHIMMER_CLASS,
  initialMealIdeasState,
  MEAL_IDEAS_COUNT,
  MEAL_IDEAS_SENDS,
  mealPhrase,
  type IdeaMeal,
  type MealIdeasState,
} from "./meal-ideas"

type State = MealIdeasState<ShownIdea>
type Fetched = Extract<State, { status: "ready" | "note" }>

const noSubscribe = () => () => {}

async function fetchIdeas(meal: IdeaMeal): Promise<Fetched> {
  const result = await callAction(() => getMealIdeas(meal))
  if (result.error !== undefined) return { status: "note", message: result.error }
  return { status: "ready", ideas: result.ideas }
}

/**
 * AI ideas for the meal on screen, shown on Recipes when the household's own ideas are thin.
 * The page renders without waiting for it. Nothing is sent until this device has agreed (Apple
 * 5.1.2): with consent already stored it fetches on mount; otherwise it offers one tile, and
 * tapping it asks first. Ideas aren't stored anywhere but the hour cache unless saved.
 */
export function MealIdeas({ meal }: { meal: IdeaMeal }) {
  // Null on the server and the first client render; read from localStorage after that.
  const consented = useSyncExternalStore(noSubscribe, () => hasAiConsent(MEAL_IDEAS_SENDS), () => null)
  const [, rerender] = useState(0)
  const [fetched, setFetched] = useState<{ meal: IdeaMeal; state: Fetched } | null>(null)
  // One request per meal, even when Strict Mode runs the effect twice.
  const pending = useRef<{ meal: IdeaMeal; promise: Promise<Fetched> } | null>(null)
  const { ensureConsent, dialog } = useAiConsent(MEAL_IDEAS_SENDS)

  useEffect(() => {
    if (!consented) return
    if (pending.current?.meal !== meal) pending.current = { meal, promise: fetchIdeas(meal) }
    let current = true
    void pending.current.promise.then((state) => {
      if (current) setFetched({ meal, state })
    })
    return () => {
      current = false
    }
  }, [consented, meal])

  async function offerTapped() {
    // Agreeing stores consent; the re-render then reads it and the effect fetches.
    if (await ensureConsent()) rerender((n) => n + 1)
  }

  if (consented === null) return null
  const state: State = fetched?.meal === meal ? fetched.state : initialMealIdeasState(consented)
  const phrase = mealPhrase(meal)

  if (state.status === "note") {
    return <p className="text-center text-xs text-muted-foreground">AI ideas: {state.message}</p>
  }

  return (
    <section className="grid gap-3" aria-label={`AI ideas for ${phrase}`} aria-busy={state.status === "loading"}>
      {state.status === "offer" ? (
        <RecipeGrid>
          <OfferTile phrase={phrase} onClick={() => void offerTapped()} />
        </RecipeGrid>
      ) : (
        <>
          <div className="grid gap-0.5">
            <h2 className="inline-flex items-center gap-1.5 font-heading text-xl font-semibold">
              <Sparkles className="size-5 text-violet-600 dark:text-violet-300" aria-hidden /> AI ideas for {phrase}
            </h2>
            <p className="text-sm text-muted-foreground">Made by AI from your pantry. Check before you cook.</p>
          </div>
          {state.status === "loading" ? <SkeletonTiles /> : <IdeaTiles ideas={state.ideas} meal={meal} />}
        </>
      )}
      {dialog}
    </section>
  )
}

function SkeletonTiles() {
  return (
    <RecipeGrid>
      {Array.from({ length: MEAL_IDEAS_COUNT }, (_, i) => (
        <li key={i} className="grid min-w-0 gap-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </li>
      ))}
    </RecipeGrid>
  )
}

function OfferTile({ phrase, onClick }: { phrase: string; onClick: () => void }) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        className="group grid w-full gap-2 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          className={cn(
            AI_SHIMMER_CLASS,
            "flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center shadow-sm ring-1 ring-violet-500/20 transition-transform group-active:scale-[0.98]",
          )}
        >
          <Sparkles className="size-8 text-violet-600 dark:text-violet-300" aria-hidden />
          <span className="text-sm font-semibold text-balance">Get AI ideas for {phrase}</span>
        </div>
        <span className="px-0.5 text-xs text-muted-foreground">From what&apos;s in your pantry</span>
      </button>
    </li>
  )
}

function IdeaTiles({ ideas, meal }: { ideas: ShownIdea[]; meal: IdeaMeal }) {
  const router = useRouter()
  const [shown, setShown] = useState<ShownIdea | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, startSaving] = useTransition()

  function save(idea: ShownIdea) {
    startSaving(async () => {
      const result = await callAction(() => saveAiRecipe(idea.recipe, meal))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      toast.success(`Saved ${idea.recipe.title} to your recipes`)
      setOpen(false)
      router.push(recipeHref(result.id))
    })
  }

  return (
    <>
      <RecipeGrid>
        {ideas.map((idea) => (
          <AiIdeaTile
            key={idea.recipe.title}
            idea={idea}
            onOpen={() => {
              setShown(idea)
              setOpen(true)
            }}
          />
        ))}
      </RecipeGrid>
      <AiRecipeSheet
        idea={shown}
        open={open}
        onOpenChange={setOpen}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" className="h-12 flex-1 text-base" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={saving || !shown}
              onClick={() => shown && save(shown)}
            >
              {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : <BookmarkPlus aria-hidden />}
              Save to our recipes
            </Button>
          </div>
        }
      />
    </>
  )
}

/** Same size as a RecipeTile, with a looping gradient border, a sparkle and an "AI idea" label. */
function AiIdeaTile({ idea, onOpen }: { idea: ShownIdea; onOpen: () => void }) {
  const { recipe, missing } = idea
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="group grid w-full gap-2 rounded-2xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className={cn(AI_BORDER_CLASS, "relative aspect-square w-full rounded-2xl p-[3px] transition-transform group-active:scale-[0.98]")}>
          <div className="flex size-full flex-col items-center justify-center gap-2 rounded-[13px] bg-gradient-to-br from-violet-100 via-card to-amber-50 p-3 text-center dark:from-violet-950 dark:via-card dark:to-amber-950/40">
            <Sparkles className="size-9 text-violet-600 dark:text-violet-300" aria-hidden />
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-600/10 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-300/15 dark:text-violet-200">
              AI idea
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end gap-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
              <Clock className="size-3" aria-hidden />
              {recipe.minutes} min
            </span>
          </div>
        </div>
        <div className="grid min-w-0 gap-1 px-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{recipe.title}</h3>
          {missing.length === 0 ? (
            <p className="text-xs font-medium text-primary">You have everything</p>
          ) : (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-amber-700 dark:text-amber-400">Need {missing.length}:</span> {missing.map(displayName).join(", ")}
            </p>
          )}
        </div>
      </button>
    </li>
  )
}
