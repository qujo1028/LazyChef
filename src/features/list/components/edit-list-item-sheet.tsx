"use client"

import { LoaderCircle, Trash2 } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { callAction } from "@/features/pantry/components/call-action"
import { CategorySelect, UnitSelect } from "@/features/pantry/components/selects"
import { categoryLabel, displayName } from "@/features/pantry/display"

import { addListItems, deleteListItems, updateListItem } from "../actions"
import { amountText } from "../display"
import { listChangedFields, listFormErrors, listFormFromItem, type ListItemForm } from "../item-form"
import type { ListChange } from "../list-state"
import type { ListItem } from "../types"

/**
 * Tap a line's pencil → fix its name, amount, category or note, or delete it (with Undo).
 * `item` is the live row (null once someone removes it or puts it away).
 */
export function EditListItemSheet({
  item,
  open,
  onOpenChange,
  onCloseAutoFocus,
  apply,
}: {
  item: ListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
  apply: (change: ListChange) => void
}) {
  // Keep showing the last version while the sheet slides away (or after a housemate removes it).
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  const current = item ?? shown

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto w-full max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        {current ? (
          <EditContent
            key={current.id}
            item={current}
            gone={open && item === null}
            close={() => onOpenChange(false)}
            apply={apply}
          />
        ) : (
          <DrawerTitle className="sr-only">List item</DrawerTitle>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function EditContent({
  item,
  gone,
  close,
  apply,
}: {
  item: ListItem
  gone: boolean
  close: () => void
  apply: (change: ListChange) => void
}) {
  const id = useId()
  const formId = `${id}-form`
  const [initial] = useState(() => listFormFromItem(item))
  const [form, setForm] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [pending, startTransition] = useTransition()

  const name = displayName(item.name)
  const errors = listFormErrors(form)
  const shownErrors = showErrors ? errors : {}
  const dirty = (Object.keys(initial) as (keyof ListItemForm)[]).some((key) => form[key] !== initial[key])
  const set = (patch: Partial<ListItemForm>) => setForm((current) => ({ ...current, ...patch }))

  function save(event: React.FormEvent) {
    event.preventDefault()
    if (pending || gone) return
    if (errors.name || errors.quantity || errors.note) {
      setShowErrors(true)
      return
    }
    const fields = listChangedFields(initial, form)
    if (Object.keys(fields).length === 0) {
      close()
      return
    }
    const before = item
    apply({ type: "patch", id: item.id, fields })
    startTransition(async () => {
      const result = await callAction(() => updateListItem(item.id, fields))
      if (result.error !== undefined) {
        apply({ type: "upsert", item: before })
        toast.error(result.error)
        return
      }
      apply({ type: "upsert", item: result.item })
      toast.success(`Saved ${displayName(result.item.name).toLowerCase()}`)
      close()
    })
  }

  function remove() {
    const before = item
    apply({ type: "remove", id: item.id })
    close()
    startTransition(async () => {
      const result = await callAction(() => deleteListItems([before.id]))
      if (result.error !== undefined) {
        toast.error(result.error)
        return
      }
      toast.success(`Removed ${before.name.trim()}`, {
        action: {
          label: "Undo",
          onClick: () =>
            void callAction(() =>
              addListItems([
                {
                  name: before.name,
                  quantity: before.quantity,
                  unit: before.unit,
                  category: before.category,
                  ingredient_id: before.ingredient_id,
                  note: before.note,
                  recipe_id: before.recipe_id,
                  recipe_title: before.recipe_title,
                },
              ]),
            ).then((undo) => {
              if (undo.error !== undefined) toast.error(undo.error)
            }),
        },
      })
    })
  }

  const summary = [amountText(item), categoryLabel(item.category)].filter(Boolean).join(" · ")

  return (
    <>
      <DrawerHeader className="gap-1 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">{name}</DrawerTitle>
        <DrawerDescription>{summary}</DrawerDescription>
        {item.recipe_title ? <p className="text-xs text-muted-foreground">For {item.recipe_title}</p> : null}
      </DrawerHeader>

      {gone ? (
        <div className="grid gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p role="status" className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            Someone in your household just removed this or put it away.
          </p>
          <Button size="lg" variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <form
            id={formId}
            onSubmit={save}
            noValidate
            className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto overscroll-contain px-4 pb-4"
            data-vaul-no-drag
          >
            <Field data-invalid={shownErrors.name ? true : undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
                maxLength={80}
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={shownErrors.name ? true : undefined}
              />
              <FieldError>{shownErrors.name}</FieldError>
            </Field>

            <Field data-invalid={shownErrors.quantity ? true : undefined}>
              <FieldLabel htmlFor={`${id}-quantity`}>Amount</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={`${id}-quantity`}
                  value={form.quantity}
                  onChange={(event) => set({ quantity: event.target.value })}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="Any"
                  aria-invalid={shownErrors.quantity ? true : undefined}
                  aria-describedby={`${id}-quantity-hint`}
                  className="w-28 tabular-nums"
                />
                <UnitSelect aria-label="Unit" value={form.unit} onValueChange={(unit) => set({ unit })} className="flex-1" />
              </div>
              <FieldError>{shownErrors.quantity}</FieldError>
              <FieldDescription id={`${id}-quantity-hint`}>Leave it empty for any amount.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-category`}>Aisle</FieldLabel>
              <CategorySelect id={`${id}-category`} value={form.category} onValueChange={(category) => set({ category })} />
              {form.category !== initial.category ? (
                <FieldDescription>We&apos;ll remember this for next time.</FieldDescription>
              ) : null}
            </Field>

            <Field data-invalid={shownErrors.note ? true : undefined}>
              <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
              <Input
                id={`${id}-note`}
                value={form.note}
                onChange={(event) => set({ note: event.target.value })}
                maxLength={200}
                autoComplete="off"
                enterKeyHint="done"
                placeholder="Brand, size, “the good one”…"
                aria-invalid={shownErrors.note ? true : undefined}
              />
              <FieldError>{shownErrors.note}</FieldError>
            </Field>
          </form>

          <DrawerFooter className="flex-row border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="size-12"
              aria-label={`Remove ${name} from the list`}
              onClick={remove}
              disabled={pending}
            >
              <Trash2 className="size-5" aria-hidden />
            </Button>
            <Button type="submit" form={formId} size="lg" className="h-12 flex-1 text-base" disabled={pending || !dirty}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DrawerFooter>
        </>
      )}
    </>
  )
}
