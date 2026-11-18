"use client"

import { ThumbsDown, ThumbsUp } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { callAction } from "@/lib/call-action"
import { cn } from "@/lib/utils"

import { rateRecipe } from "../actions"
import type { Rating } from "@lazychef/core/recipes/ratings-core"

/** Thumbs up / down for a recipe the viewer cooked. Tapping the other one changes the vote. */
export function RatingButtons({
  recipeId,
  title,
  initial = null,
  onRated,
  className,
}: {
  recipeId: string
  title: string
  initial?: Rating | null
  onRated?: (rating: Rating) => void
  className?: string
}) {
  const [value, setValue] = useState<Rating | null>(initial)
  const [pending, startTransition] = useTransition()

  function rate(rating: Rating) {
    if (pending || rating === value) return
    startTransition(async () => {
      const result = await callAction(() => rateRecipe(recipeId, rating))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      setValue(rating)
      onRated?.(rating)
    })
  }

  return (
    <div role="group" aria-label={`Rate ${title}`} className={cn("flex gap-2", className)}>
      {([1, -1] as const).map((rating) => (
        <Button
          key={rating}
          type="button"
          variant={value === rating ? "default" : "outline"}
          className="h-11 min-w-14"
          aria-pressed={value === rating}
          aria-label={rating === 1 ? "Thumbs up" : "Thumbs down"}
          disabled={pending}
          onClick={() => rate(rating)}
        >
          {rating === 1 ? <ThumbsUp aria-hidden /> : <ThumbsDown aria-hidden />}
        </Button>
      ))}
    </div>
  )
}
