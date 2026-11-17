"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useRef } from "react"

import { Brand } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ChipGroup, ChoiceChip } from "@/features/preferences/components/choice-chip"
import {
  ALLERGIES,
  CUISINES,
  DIETS,
  STAPLE_LABELS,
  STARTER_STAPLES,
  type FoodPreferences,
} from "@/features/preferences/options"
import { useFirstRunDraft } from "@/features/preferences/use-draft"
import { markTourSeen } from "@/lib/first-run"
import { cn } from "@/lib/utils"

import { CookIllustration, ListIllustration, PantryIllustration, ScanIllustration } from "../illustrations"

const TOUR = [
  {
    eyebrow: "Shared pantry",
    title: "One pantry for everyone you live with",
    body: "Your whole household sees the same shelves, updated live. No more buying a third jar of cumin.",
    Illustration: PantryIllustration,
  },
  {
    eyebrow: "Add in seconds",
    title: "Scan it, tap it, done",
    body: "Scan a barcode or quick-add by name. Set an expiry and we’ll nudge you before things go off.",
    Illustration: ScanIllustration,
  },
  {
    eyebrow: "Shopping list",
    title: "One list, shared at the shop",
    body: "Anyone can add to it. Tick things off and they move straight into the pantry.",
    Illustration: ListIllustration,
  },
  {
    eyebrow: "What can I cook?",
    title: "Recipes from what you already have",
    body: "Ideas ranked by what’s in your pantry. Cook mode walks you through and uses up the ingredients.",
    Illustration: CookIllustration,
  },
] as const

const TOUR_STEPS = TOUR.length
/** Tour cards, then diet & allergies, cuisines and staples. */
const LAST_STEP = TOUR_STEPS + 3
const SWIPE_PX = 50

function parseStep(value: string | null): number {
  const step = Number(value)
  return Number.isInteger(step) && step >= 1 && step <= LAST_STEP ? step : 1
}

function stepUrl(step: number) {
  return step === 1 ? "/welcome" : `/welcome?step=${step}`
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value)
}

/**
 * The first-run walkthrough at /welcome (Figma frames 01–07): four tour cards, then three
 * skippable preference steps, ending at sign-up. The step lives in ?step= so the browser's
 * Back button and a reload keep your place; answers wait in this browser until sign-up.
 */
export function WelcomeFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const step = parseStep(params.get("step"))
  const [draft, update] = useFirstRunDraft()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const tour = step <= TOUR_STEPS

  // Steps we pushed onto the history stack, so Back can pop them instead of leaving the app
  // when someone opened a ?step= link directly.
  const pushed = useRef(0)

  function go(next: number) {
    pushed.current += 1
    window.history.pushState(null, "", stepUrl(next))
  }

  function back() {
    if (step <= 1) return
    if (pushed.current > 0) {
      pushed.current -= 1
      window.history.back()
    } else {
      window.history.replaceState(null, "", stepUrl(step - 1))
    }
  }

  function leave(to: "/signup" | "/login") {
    markTourSeen()
    router.push(to)
  }

  const next = () => (step < LAST_STEP ? go(step + 1) : leave("/signup"))

  // Move focus to the new heading so screen readers announce the step (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  // Arrow keys move between tour cards.
  useEffect(() => {
    if (!tour) return
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [role=switch]")) return
      const to = event.key === "ArrowRight" ? step + 1 : event.key === "ArrowLeft" && step > 1 ? step - 1 : null
      if (to === null) return
      event.preventDefault()
      pushed.current += 1
      window.history.pushState(null, "", stepUrl(to))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tour, step])

  function setPrefs(change: (prefs: FoodPreferences) => FoodPreferences) {
    update((d) => ({ ...d, prefs: change(d.prefs), touched: true, prefsSaved: false }))
  }

  const header = (
    <header className="flex h-14 shrink-0 items-center justify-between px-3">
      {step === 1 ? (
        <span className="pl-3">
          <Brand />
        </span>
      ) : (
        <Button type="button" variant="ghost" size="icon" onClick={back} aria-label="Back">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
      )}
      {tour ? null : (
        <Badge variant="secondary" aria-hidden>
          Step {step - TOUR_STEPS} of 3
        </Badge>
      )}
      <Button type="button" variant="ghost" onClick={() => leave("/signup")}>
        Skip
      </Button>
    </header>
  )

  if (tour) {
    const card = TOUR[step - 1]
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {header}
        <main
          className="flex flex-1 touch-pan-y flex-col justify-center gap-7 px-6 pt-2"
          aria-roledescription="carousel"
          aria-label="How LazyChef works"
          onPointerDown={(event) => {
            swipe.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerUp={(event) => {
            const start = swipe.current
            swipe.current = null
            if (!start) return
            const dx = event.clientX - start.x
            const dy = event.clientY - start.y
            if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return
            if (dx < 0) go(step + 1)
            else if (step > 1) go(step - 1)
          }}
        >
          <section
            key={step}
            role="group"
            aria-roledescription="slide"
            aria-label={`${step} of ${TOUR_STEPS}`}
            className="grid gap-7 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-6 motion-safe:duration-300"
          >
            <div className="grid h-[17.5rem] place-items-center overflow-hidden rounded-2xl bg-secondary">
              <card.Illustration className="h-auto w-80 max-w-[90%]" />
            </div>
            <div className="grid gap-2.5">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">{card.eyebrow}</p>
              <h1 ref={headingRef} tabIndex={-1} className="text-[2rem] leading-[2.375rem] font-semibold tracking-tight outline-none">
                {card.title}
              </h1>
              <p className="text-muted-foreground">{card.body}</p>
            </div>
          </section>
        </main>
        <footer className="grid shrink-0 justify-items-center gap-3 px-6 pt-3 pb-1">
          <div className="flex items-center gap-1.5" aria-hidden>
            {TOUR.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 rounded-full transition-all motion-reduce:transition-none",
                  i + 1 === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <Button type="button" size="lg" className="w-full" onClick={next}>
            {step === TOUR_STEPS ? "Set my preferences" : "Next"}
            <ArrowRight aria-hidden />
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => leave("/login")}>
            I already have an account
          </Button>
        </footer>
      </div>
    )
  }

  const prefs = draft.prefs
  const prefStep = step - TOUR_STEPS
  const nothing =
    prefStep === 1
      ? prefs.diet === "none" && prefs.allergies.length === 0
      : prefStep === 2
        ? prefs.cuisines.length === 0 && !prefs.worldRecipes
        : draft.staples.length === 0

  const content =
    prefStep === 1 ? (
      <DietStep prefs={prefs} setPrefs={setPrefs} />
    ) : prefStep === 2 ? (
      <CuisineStep prefs={prefs} setPrefs={setPrefs} />
    ) : (
      <ChipGroup legend="Staples" hint={draft.staples.length ? `${draft.staples.length} selected` : "Pick any"}>
        {STARTER_STAPLES.map((staple) => (
          <ChoiceChip
            key={staple}
            pressed={draft.staples.includes(staple)}
            onPressedChange={(on) => update((d) => ({ ...d, staples: toggle(d.staples, staple, on) }))}
          >
            {STAPLE_LABELS[staple]}
          </ChoiceChip>
        ))}
      </ChipGroup>
    )

  const copy = [
    { title: "Anything you don’t eat?", body: "We’ll hide recipes that don’t fit, here and in recipe search." },
    { title: "What do you like to eat?", body: "We’ll put these first when we suggest recipes." },
    {
      title: "What’s already in your kitchen?",
      body: "Tap the basics you have. We’ll put them in your pantry so recipe ideas work from day one.",
    },
  ][prefStep - 1]

  const note =
    prefStep === 3
      ? nothing
        ? "You can add these later from the pantry."
        : `${draft.staples.length} ${draft.staples.length === 1 ? "item" : "items"} will be added once your household is set up.`
      : nothing
        ? prefStep === 1
          ? "Nothing selected: we’ll show every recipe."
          : "Nothing selected: we’ll mix everyday cuisines."
        : "You can change this later in Household → You."

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pt-[env(safe-area-inset-top)]">
      {header}
      <main
        key={step}
        className="flex flex-1 flex-col gap-6 px-6 pt-2 pb-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      >
        <div className="grid gap-2">
          <p className="sr-only">Step {prefStep} of 3</p>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
            {copy.title}
          </h1>
          <p className="text-muted-foreground">{copy.body}</p>
        </div>
        {content}
      </main>
      <footer className="sticky bottom-0 grid gap-2.5 border-t bg-background px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
        <Button type="button" size="lg" className="w-full" onClick={next}>
          {prefStep === 3 ? "Continue to sign up" : "Continue"}
          <ArrowRight aria-hidden />
        </Button>
        <p className="pb-1 text-center text-sm text-muted-foreground" aria-live="polite">
          {note}
        </p>
      </footer>
    </div>
  )
}

type StepProps = { prefs: FoodPreferences; setPrefs: (change: (prefs: FoodPreferences) => FoodPreferences) => void }

function DietStep({ prefs, setPrefs }: StepProps) {
  return (
    <>
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
    </>
  )
}

function CuisineStep({ prefs, setPrefs }: StepProps) {
  const worldId = useId()
  return (
    <>
      <ChipGroup legend="Cuisines" hint="Pick any">
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
        <Switch
          id={worldId}
          checked={prefs.worldRecipes}
          onCheckedChange={(on) => setPrefs((p) => ({ ...p, worldRecipes: on }))}
        />
      </div>
    </>
  )
}
