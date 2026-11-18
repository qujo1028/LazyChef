"use client"

import { X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { useStripParams } from "@/lib/use-strip-params"

import type { OwnRecipeDraft } from "../own-recipe"
import { RecipeForm } from "./recipe-form"

/**
 * Add or edit one of the household's own recipes in a tall sheet, so it isn't a screen of its
 * own. The button is `children`: "Add your own recipe" on Recipes, "Edit recipe" on a recipe.
 * `defaultOpen` opens it on arrival (?new=1 or ?edit=1, from the old /recipes/new and
 * /recipes/[id]/edit addresses).
 */
export function RecipeSheet({
  householdId,
  recipeId = null,
  initial,
  initialPhotoUrl = null,
  defaultOpen = false,
  variant = "outline",
  className,
  children,
}: {
  householdId: string
  /** Set when editing. */
  recipeId?: string | null
  initial?: OwnRecipeDraft
  initialPhotoUrl?: string | null
  defaultOpen?: boolean
  variant?: "default" | "outline" | "ghost"
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  useStripParams(["new", "edit"])
  const editing = recipeId !== null

  return (
    <Drawer open={open} onOpenChange={setOpen} handleOnly>
      <DrawerTrigger asChild>
        <Button type="button" variant={variant} size="lg" className={className}>
          {children}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        className="mx-auto h-[92dvh] w-full max-w-lg data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
        // Typing a whole recipe shouldn't vanish on a stray tap outside; the X and Escape close it.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DrawerHeader className="relative text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="pr-12 text-lg">{editing ? "Edit recipe" : "Add your own recipe"}</DrawerTitle>
          <DrawerDescription>
            {editing ? "Changes show up for everyone in your household." : "It shows up in Make now and Almost there for everyone in your household."}
          </DrawerDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-11"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </DrawerHeader>
        <div className="grid min-h-0 flex-1 content-start overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <RecipeForm
            householdId={householdId}
            recipeId={recipeId}
            initial={initial}
            initialPhotoUrl={initialPhotoUrl}
            onSaved={(id) => {
              setOpen(false)
              // A new recipe opens on its own page; an edited one is already there, so just refresh it.
              if (editing) router.refresh()
              else router.push(`/recipes/${id}`)
            }}
            onDeleted={() => {
              setOpen(false)
              router.replace("/recipes?view=ours")
            }}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
