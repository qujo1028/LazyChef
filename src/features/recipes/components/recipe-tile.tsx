import { AlarmClock, Clock } from "lucide-react"
import Link from "next/link"

import { recipeHref, type RecipeSource } from "../ref"
import { RecipeImage } from "./recipe-image"
import { SaveButton } from "./save-button"
import { SourceTag } from "./source-tag"

/** Photo-first grid tile shared by Ideas, Saved and Ours. `children` is the status line(s) under the title. */
export function RecipeTile({
  id,
  source,
  title,
  image,
  readyInMinutes,
  saved,
  expiring,
  children,
}: {
  id: string
  source: RecipeSource
  title: string
  image: string | null
  readyInMinutes: number | null
  saved: boolean
  /** Shown as a badge on the photo: "Uses up spinach". */
  expiring?: string | null
  children?: React.ReactNode
}) {
  return (
    <li className="relative min-w-0">
      <Link href={recipeHref(id)} className="group grid gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="relative">
          <RecipeImage
            src={image}
            className="aspect-square w-full rounded-2xl shadow-sm ring-1 ring-black/5 transition-transform group-active:scale-[0.98] dark:ring-white/5"
          />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end gap-1">
            {expiring ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-tomato px-2 py-0.5 text-[11px] font-medium text-tomato-foreground shadow-sm">
                <AlarmClock className="size-3 shrink-0" aria-hidden />
                <span className="truncate">Uses up {expiring}</span>
              </span>
            ) : null}
            {readyInMinutes ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
                <Clock className="size-3" aria-hidden />
                {readyInMinutes} min
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-1 px-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{title}</h3>
          {source === "user" ? <SourceTag source={source} /> : null}
          {children}
        </div>
      </Link>
      <SaveButton
        recipeId={id}
        title={title}
        image={source === "spoonacular" ? image : null}
        saved={saved}
        variant="secondary"
        className="absolute top-1.5 right-1.5 bg-background/85 shadow-sm backdrop-blur hover:bg-background"
      />
    </li>
  )
}

/** Two-column grid of tiles. */
export function RecipeGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid grid-cols-2 gap-x-3 gap-y-5">{children}</ul>
}
