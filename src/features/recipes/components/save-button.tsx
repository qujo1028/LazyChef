"use client"

import { Heart } from "lucide-react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { callAction } from "@/lib/call-action"
import { cn } from "@/lib/utils"

import { saveRecipe, unsaveRecipe } from "../actions"

/** The heart: saves a recipe for the whole household (a bookmark, not a copy), or takes it off Saved. */
export function SaveButton({
  recipeId,
  title,
  image = null,
  saved,
  className,
  variant = "ghost",
}: {
  /** The recipe's ref (Spoonacular's id or our uuid). */
  recipeId: string
  title: string
  /** Spoonacular's photo, kept with the bookmark (ours are loaded from the recipe). */
  image?: string | null
  saved: boolean
  className?: string
  variant?: "ghost" | "outline" | "secondary"
}) {
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [, startTransition] = useTransition()

  function toggle() {
    const next = !optimistic
    startTransition(async () => {
      setOptimistic(next)
      const result = await callAction(() => (next ? saveRecipe(recipeId, title, image) : unsaveRecipe(recipeId)))
      if (result.error !== undefined) toast.error(result.error)
      else toast.success(next ? "Saved for your household" : "Removed from Saved")
    })
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      onClick={toggle}
      aria-pressed={optimistic}
      aria-label={optimistic ? `Unsave ${title}` : `Save ${title}`}
      className={cn("rounded-full", className)}
    >
      <Heart
        className={cn("size-5 transition-colors", optimistic ? "fill-rose-500 text-rose-500" : "text-muted-foreground")}
        aria-hidden
      />
    </Button>
  )
}
