"use client"

import { CircleAlert, Info, X } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { SpoonacularStatus } from "../resolve-core"
import { ingredientEmoji } from "@/lib/ingredients/emoji"
import { cn } from "@/lib/utils"

import { displayName } from "../display"
import { CATEGORY_SOURCE_HINT, draftError, type ReviewDraft } from "../review"
import { ExpiryPicker } from "./expiry-picker"
import { CategorySelect, UnitSelect } from "./selects"

/**
 * The editable "check before adding" list, shared by quick add and bulk add.
 * Errors only show once `showErrors` is set (after the first "Add" attempt).
 */
export function ReviewList({
  drafts,
  onChange,
  today,
  showErrors,
  disabled,
  hints,
}: {
  drafts: readonly ReviewDraft[]
  onChange: (drafts: ReviewDraft[]) => void
  today: string
  showErrors: boolean
  disabled?: boolean
  /** A note per draft key, e.g. "Adds to your chicken breast (1 lb now)". */
  hints?: ReadonlyMap<string, string>
}) {
  return (
    <ul className="grid grid-cols-1 gap-3" aria-label="Items to add">
      {drafts.map((draft) => (
        <ReviewItemCard
          key={draft.key}
          draft={draft}
          today={today}
          showErrors={showErrors}
          disabled={disabled}
          hint={hints?.get(draft.key)}
          onChange={(next) => onChange(drafts.map((d) => (d.key === draft.key ? next : d)))}
          onRemove={() => onChange(drafts.filter((d) => d.key !== draft.key))}
        />
      ))}
    </ul>
  )
}

function ReviewItemCard({
  draft,
  today,
  showErrors,
  disabled,
  hint,
  onChange,
  onRemove,
}: {
  draft: ReviewDraft
  today: string
  showErrors: boolean
  disabled?: boolean
  hint?: string
  onChange: (draft: ReviewDraft) => void
  onRemove: () => void
}) {
  const id = useId()
  const errors = showErrors ? draftError(draft) : {}
  const label = draft.name.trim() ? displayName(draft.name) : "this item"
  const changed = draft.category !== draft.suggestedCategory
  const unsure = !changed && draft.categorySource === "fallback"
  const set = (patch: Partial<ReviewDraft>) => onChange({ ...draft, ...patch })

  return (
    <li className="grid gap-2 rounded-xl border bg-card p-3" data-vaul-no-drag>
      <div className="flex items-start gap-2">
        <span className="flex h-11 w-7 shrink-0 items-center justify-center text-xl leading-none" aria-hidden>
          {ingredientEmoji(draft)}
        </span>
        <Input
          aria-label="Name"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          maxLength={80}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          disabled={disabled}
          className="font-medium"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-muted-foreground"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Don't add ${label}`}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </div>
      {errors.name ? <FieldError id={`${id}-name-error`}>{errors.name}</FieldError> : null}
      {hint ? (
        <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-primary">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Amount"
          placeholder="Qty"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={draft.quantity}
          onChange={(event) => set({ quantity: event.target.value })}
          aria-invalid={errors.quantity ? true : undefined}
          aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
          disabled={disabled}
          className="w-14 tabular-nums"
        />
        <UnitSelect
          aria-label="Unit"
          value={draft.unit}
          onValueChange={(unit) => set({ unit })}
          disabled={disabled}
          className="w-[6.5rem]"
        />
        <label className="ml-auto flex min-h-11 items-center gap-2.5 text-sm">
          <Checkbox
            checked={draft.isStaple}
            onCheckedChange={(checked) => set({ isStaple: checked === true })}
            disabled={disabled}
            className="size-5"
          />
          Always on hand
        </label>
      </div>
      {errors.quantity ? <FieldError id={`${id}-quantity-error`}>{errors.quantity}</FieldError> : null}

      <div className="grid gap-1">
        <CategorySelect
          aria-label="Category"
          aria-describedby={`${id}-category-hint`}
          value={draft.category}
          onValueChange={(category) => set({ category })}
          disabled={disabled}
        />
        <p
          id={`${id}-category-hint`}
          className={cn(
            "flex items-center gap-1 px-1 text-xs text-muted-foreground",
            unsure && "text-amber-700 dark:text-amber-400",
          )}
        >
          {unsure ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : null}
          {changed ? "We'll remember this category next time." : CATEGORY_SOURCE_HINT[draft.categorySource]}
        </p>
      </div>

      <ExpiryPicker
        value={draft.expiresOn}
        onChange={(expiresOn) => set({ expiresOn })}
        today={today}
        label={`${label} expires`}
        disabled={disabled}
      />
    </li>
  )
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="px-1 text-sm text-destructive">
      {children}
    </p>
  )
}

/** Spoonacular trouble (no key, out of points…), said quietly: the items still work. */
export function SpoonacularNote({ status }: { status: SpoonacularStatus }) {
  if (!status.error) return null
  return (
    <p className="flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      {status.error}
    </p>
  )
}
