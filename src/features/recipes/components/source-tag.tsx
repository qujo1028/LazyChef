import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

import { SOURCE_LABELS, type RecipeSource } from "../ref"

const STYLES: Record<RecipeSource, string> = {
  user: "bg-primary/10 text-primary",
  themealdb: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  spoonacular: "bg-muted text-muted-foreground",
}

const AI_STYLE = "bg-violet-600/10 text-violet-800 dark:bg-violet-300/15 dark:text-violet-200"

/** "Your recipe", "From TheMealDB" or "Powered by Spoonacular"; "AI idea" for a saved AI recipe. */
export function SourceTag({ source, aiGenerated = false, className }: { source: RecipeSource; aiGenerated?: boolean; className?: string }) {
  const ai = aiGenerated && source === "user"
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium",
        ai ? AI_STYLE : STYLES[source],
        className,
      )}
    >
      {ai ? <Sparkles className="size-3" aria-hidden /> : null}
      {ai ? "AI idea" : SOURCE_LABELS[source]}
    </span>
  )
}
