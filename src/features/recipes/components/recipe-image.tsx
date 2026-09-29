import { ChefHat } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Spoonacular's recipe photo. A plain <img>: the images are already sized for cards, and
 * running them through Vercel's optimizer would only spend its quota.
 */
export function RecipeImage({ src, className, eager = false }: { src: string | null; className?: string; eager?: boolean }) {
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)} aria-hidden>
        <ChefHat className="size-8" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("bg-muted object-cover", className)}
    />
  )
}
