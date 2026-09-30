import { cn } from "@/lib/utils"

import { SOURCE_LABELS, type RecipeSource } from "../ref"

const STYLES: Record<RecipeSource, string> = {
  user: "bg-primary/10 text-primary",
  themealdb: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  spoonacular: "bg-muted text-muted-foreground",
}

/** "Your recipe", "From TheMealDB" or "Powered by Spoonacular". */
export function SourceTag({ source, className }: { source: RecipeSource; className?: string }) {
  return (
    <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium", STYLES[source], className)}>
      {SOURCE_LABELS[source]}
    </span>
  )
}
