"use client"

import { LoaderCircle, Plus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmButton } from "@/components/confirm-button"
import { FormMessage } from "@/components/form-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { callAction } from "@/lib/call-action"
import { cn } from "@/lib/utils"

import { MEAL_FILTERS } from "../filters"
import { deleteOwnRecipe, discardRecipePhoto, saveOwnRecipe } from "../own-actions"
import { fieldErrors, MAX_STEP_LENGTH, MAX_STEPS, MAX_TITLE_LENGTH, parseIngredientLines, validateOwnRecipe, type OwnRecipeDraft } from "../own-recipe"
import { IngredientLinesBox } from "./ingredient-lines-box"
import { PhotoField } from "./photo-field"

type Errors = Partial<Record<keyof OwnRecipeDraft, string>>

export const EMPTY_DRAFT: OwnRecipeDraft = {
  title: "",
  readyInMinutes: "",
  servings: "",
  mealTypes: [],
  ingredients: "",
  steps: [""],
  photoPath: null,
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Add or edit one of the household's own recipes. */
export function RecipeForm({
  householdId,
  recipeId = null,
  initial = EMPTY_DRAFT,
  initialPhotoUrl = null,
}: {
  householdId: string
  /** Set when editing. */
  recipeId?: string | null
  initial?: OwnRecipeDraft
  initialPhotoUrl?: string | null
}) {
  const id = useId()
  const router = useRouter()
  const [draft, setDraft] = useState<OwnRecipeDraft>(initial)
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Photos uploaded here but not saved yet, removed if they're swapped out.
  const unsaved = useRef(new Set<string>())
  const stepRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  const count = draft.ingredients.trim() ? parseIngredientLines(draft.ingredients).lines.length : 0

  function update<K extends keyof OwnRecipeDraft>(key: K, value: OwnRecipeDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
    setFormError(null)
  }

  function toggleMeal(value: string) {
    update("mealTypes", draft.mealTypes.includes(value) ? draft.mealTypes.filter((t) => t !== value) : [...draft.mealTypes, value])
  }

  function setStep(index: number, value: string) {
    update(
      "steps",
      draft.steps.map((step, i) => (i === index ? value : step)),
    )
  }

  function addStep() {
    if (draft.steps.length >= MAX_STEPS) return
    update("steps", [...draft.steps, ""])
    requestAnimationFrame(() => stepRefs.current[draft.steps.length]?.focus())
  }

  function removeStep(index: number) {
    const next = draft.steps.filter((_, i) => i !== index)
    update("steps", next.length > 0 ? next : [""])
  }

  function changePhoto(next: { path: string | null; previewUrl: string | null }) {
    const previous = draft.photoPath
    if (previous && previous !== next.path && unsaved.current.has(previous)) {
      unsaved.current.delete(previous)
      void callAction(() => discardRecipePhoto(previous))
    }
    if (next.path) unsaved.current.add(next.path)
    update("photoPath", next.path)
    setPhotoUrl(next.previewUrl)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    const checked = validateOwnRecipe(draft)
    if (!checked.success) {
      const found = fieldErrors(checked.error)
      setErrors(found)
      setFormError("A few things need fixing.")
      const first = Object.keys(found)[0]
      if (first) document.getElementById(`${id}-${first}`)?.focus()
      return
    }
    startTransition(async () => {
      const result = await callAction(() => saveOwnRecipe(draft, recipeId))
      if (result.error !== undefined) {
        setFormError(result.error)
        if ("fields" in result && result.fields) setErrors(result.fields)
        return
      }
      unsaved.current.clear()
      toast.success(recipeId ? "Recipe saved" : "Recipe added for your household")
      startTransition(() => router.replace(`/recipes/${result.id}`))
    })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <Input
          id={`${id}-title`}
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          maxLength={MAX_TITLE_LENGTH + 20}
          placeholder="Grandma's pancakes"
          autoComplete="off"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          className="h-12 text-base"
        />
        <FieldError id={`${id}-title-error`} message={errors.title} />
      </div>

      <PhotoField
        householdId={householdId}
        path={draft.photoPath}
        previewUrl={photoUrl}
        onChange={changePhoto}
        disabled={pending}
        error={errors.photoPath}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-readyInMinutes`}>Time (minutes)</Label>
          <Input
            id={`${id}-readyInMinutes`}
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft.readyInMinutes}
            onChange={(event) => update("readyInMinutes", event.target.value)}
            placeholder="30"
            aria-invalid={errors.readyInMinutes ? true : undefined}
            aria-describedby={errors.readyInMinutes ? `${id}-time-error` : undefined}
            className="h-12 text-base"
          />
          <FieldError id={`${id}-time-error`} message={errors.readyInMinutes} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-servings`}>Servings</Label>
          <Input
            id={`${id}-servings`}
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft.servings}
            onChange={(event) => update("servings", event.target.value)}
            placeholder="4"
            aria-invalid={errors.servings ? true : undefined}
            aria-describedby={errors.servings ? `${id}-servings-error` : undefined}
            className="h-12 text-base"
          />
          <FieldError id={`${id}-servings-error`} message={errors.servings} />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Meal</legend>
        <div className="flex flex-wrap gap-2" id={`${id}-mealTypes`} tabIndex={-1}>
          {MEAL_FILTERS.map((meal) => {
            const on = draft.mealTypes.includes(meal.value)
            return (
              <button
                key={meal.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMeal(meal.value)}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {meal.label}
              </button>
            )
          })}
        </div>
        <FieldError id={`${id}-meal-error`} message={errors.mealTypes} />
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`${id}-ingredients`}>Ingredients</Label>
        <IngredientLinesBox
          id={`${id}-ingredients`}
          value={draft.ingredients}
          onValueChange={(value) => update("ingredients", value)}
          invalid={!!errors.ingredients}
          describedBy={`${id}-ingredients-hint`}
          disabled={pending}
        />
        <p id={`${id}-ingredients-hint`} className="px-1 text-sm text-muted-foreground" aria-live="polite">
          {count > 0 ? `${count} ${count === 1 ? "ingredient" : "ingredients"}. ` : ""}One per line, like “2 cloves garlic”. Add
          “(optional)” for extras.
        </p>
        <FieldError id={`${id}-ingredients-error`} message={errors.ingredients} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Steps</legend>
        <ol className="grid gap-2" id={`${id}-steps`} tabIndex={-1}>
          {draft.steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-3 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                {index + 1}
              </span>
              <Textarea
                ref={(node) => {
                  stepRefs.current[index] = node
                }}
                value={step}
                onChange={(event) => setStep(index, event.target.value)}
                aria-label={`Step ${index + 1}`}
                rows={2}
                maxLength={MAX_STEP_LENGTH}
                placeholder={index === 0 ? "Whisk the flour, eggs and milk." : ""}
                className="min-h-12 flex-1 px-3 py-2.5 text-base md:text-base"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => removeStep(index)}
                disabled={draft.steps.length === 1 && !step}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="lg" className="h-11" onClick={addStep} disabled={draft.steps.length >= MAX_STEPS}>
          <Plus aria-hidden /> Add a step
        </Button>
        <FieldError id={`${id}-steps-error`} message={errors.steps} />
      </fieldset>

      <FormMessage error={formError ?? undefined} />
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : recipeId ? "Save changes" : "Add recipe"}
      </Button>

      {recipeId ? (
        <ConfirmButton
          trigger={
            <Button type="button" variant="ghost" size="lg" className="h-12 text-base text-destructive hover:text-destructive" disabled={pending}>
              <Trash2 aria-hidden /> Delete recipe
            </Button>
          }
          title="Delete this recipe?"
          description="It's removed for everyone in your household, along with its photo. This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            const result = await callAction(() => deleteOwnRecipe(recipeId))
            if (result.error !== undefined) return result
            toast.success("Recipe deleted")
            router.replace("/recipes/ours")
          }}
        />
      ) : null}
    </form>
  )
}
