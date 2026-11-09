"use client"

import { ChevronRight, Loader2, Salad } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Switch } from "@/components/ui/switch"
import { actionError, callAction } from "@/lib/call-action"

import { savePreferences } from "../actions"
import { ALLERGIES, CUISINES, DIETS, labelOf, type FoodPreferences } from "../options"
import { ChipGroup, ChoiceChip } from "./choice-chip"

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value)
}

function summary(prefs: FoodPreferences) {
  const parts = [
    prefs.diet !== "none" ? labelOf(DIETS, prefs.diet) : null,
    prefs.allergies.length ? `No ${prefs.allergies.map((a) => labelOf(ALLERGIES, a).toLowerCase()).join(", ")}` : null,
    prefs.cuisines.length ? prefs.cuisines.map((c) => labelOf(CUISINES, c)).join(", ") : null,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : "No restrictions"
}

/** "Food preferences" row in the You card: diet, allergies, cuisines, world recipes. */
export function FoodPreferencesSheet({ initial }: { initial: FoodPreferences }) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(initial)
  const [pending, startTransition] = useTransition()
  const worldId = useId()

  function onOpenChange(next: boolean) {
    if (next) setPrefs(initial)
    setOpen(next)
  }

  function save() {
    startTransition(async () => {
      const error = actionError(await callAction(() => savePreferences(prefs)))
      if (error) {
        toast.error(error)
        return
      }
      toast.success("Food preferences saved")
      setOpen(false)
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="h-auto min-h-14 justify-start gap-3 py-2.5 text-left">
          <Salad className="size-5 text-primary" aria-hidden />
          <span className="grid min-w-0 flex-1">
            <span className="font-medium">Food preferences</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{summary(initial)}</span>
          </span>
          <ChevronRight className="text-muted-foreground" aria-hidden />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto grid max-h-[80dvh] w-full max-w-md gap-5 overflow-y-auto px-4">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-lg">Food preferences</DrawerTitle>
            <DrawerDescription>Recipe ideas hide what doesn&apos;t fit and put cuisines you like first. Only you see these.</DrawerDescription>
          </DrawerHeader>
          <ChipGroup legend="Diet" hint="Pick one">
            {DIETS.map((diet) => (
              <ChoiceChip
                key={diet.value}
                pressed={prefs.diet === diet.value}
                onPressedChange={(on) => setPrefs((p) => ({ ...p, diet: on ? diet.value : "none" }))}
              >
                {diet.label}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <ChipGroup legend="Allergies & intolerances" hint="Pick any">
            {ALLERGIES.map((allergy) => (
              <ChoiceChip
                key={allergy.value}
                pressed={prefs.allergies.includes(allergy.value)}
                onPressedChange={(on) => setPrefs((p) => ({ ...p, allergies: toggle(p.allergies, allergy.value, on) }))}
              >
                {allergy.label}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <ChipGroup legend="Cuisines you like" hint="Pick any">
            {CUISINES.map((cuisine) => (
              <ChoiceChip
                key={cuisine.value}
                pressed={prefs.cuisines.includes(cuisine.value)}
                onPressedChange={(on) => setPrefs((p) => ({ ...p, cuisines: toggle(p.cuisines, cuisine.value, on) }))}
              >
                {cuisine.label}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5">
            <label htmlFor={worldId} className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium">Include world recipes</span>
              <span className="text-sm text-muted-foreground">Jamaican, Polish, Syrian and more from the recipe library.</span>
            </label>
            <Switch id={worldId} checked={prefs.worldRecipes} onCheckedChange={(on) => setPrefs((p) => ({ ...p, worldRecipes: on }))} />
          </div>
        </div>
        <DrawerFooter className="mx-auto w-full max-w-md border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button type="button" size="lg" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
