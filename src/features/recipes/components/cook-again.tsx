import Link from "next/link"

import type { CookAgainCard } from "../ratings"
import { recipeHref } from "@lazychef/core/recipes/ref"
import { RecipeImage } from "./recipe-image"

/** The household's thumbs-up recipes as a short horizontal row. Hidden when there are none. */
export function CookAgain({ cards, heading = "h2" }: { cards: CookAgainCard[]; heading?: "h2" | "h3" }) {
  if (cards.length === 0) return null
  const Heading = heading
  return (
    <section className="grid gap-2" aria-label="Cook again">
      <Heading className="font-heading text-xl font-semibold">Cook again</Heading>
      <p className="-mt-1 text-sm text-muted-foreground">Thumbs up from your household.</p>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {cards.map((card) => (
          <li key={card.id} className="w-32 shrink-0">
            <Link href={recipeHref(card.id)} className="grid gap-1.5 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <RecipeImage src={card.image} className="aspect-square w-full rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/5" />
              <span className="line-clamp-2 px-0.5 text-sm leading-snug font-semibold">{card.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
