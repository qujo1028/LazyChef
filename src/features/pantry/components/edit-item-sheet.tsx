"use client"

import { CircleOff, LoaderCircle, Trash2 } from "lucide-react"
import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { ConfirmButton } from "@/components/confirm-button"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

import { deleteItem, updateItem } from "../actions"
import { expiryInfo, timeAgo } from "../dates"
import { addedByLabel, amountLabel, categoryLabel, displayName, remainingMessage, shortDate } from "../display"
import { changedFields, formFromItem, itemFormErrors, usedAmount, type ItemForm } from "../item-form"
import type { PantryChange } from "../pantry-state"
import type { PantryItem, PantryMember } from "../types"
import { ExpiryPicker } from "./expiry-picker"
import { CategorySelect, UnitSelect } from "./selects"
import { useNow } from "./use-clock"
import type { AdjustOptions } from "./use-pantry"

type SheetProps = {
  members: readonly PantryMember[]
  viewerId: string
  today: string
  serverNow: number
  apply: (change: PantryChange) => void
  adjust: (id: string, delta: number, options?: AdjustOptions) => void
}

/**
 * Tap an item → fix its name, amount, category or expiry, mark it a staple, note that
 * you used some, or delete it. `item` is the live row (null once someone deletes it).
 */
export function EditItemSheet({
  item,
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: SheetProps & {
  item: PantryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes when the sheet closes (it has no trigger button of its own). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  // Keep showing the last version while the sheet slides away (or after a housemate deletes it).
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  const current = item ?? shown

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto w-full max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        {current ? (
          <EditItemContent
            key={current.id}
            item={current}
            gone={open && item === null}
            close={() => onOpenChange(false)}
            {...props}
          />
        ) : (
          <DrawerTitle className="sr-only">Item</DrawerTitle>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function EditItemContent({
  item,
  gone,
  close,
  members,
  viewerId,
  today,
  serverNow,
  apply,
  adjust,
}: SheetProps & { item: PantryItem; gone: boolean; close: () => void }) {
  const id = useId()
  const formId = `${id}-form`
  const now = useNow(serverNow)
  const [initial] = useState(() => formFromItem(item))
  const [form, setForm] = useState(initial)
  const [showErrors, setShowErrors] = useState(false)
  const [pending, startTransition] = useTransition()

  const name = displayName(item.name)
  const errors = itemFormErrors(form)
  const shownErrors = showErrors ? errors : {}
  const dirty = (Object.keys(initial) as (keyof ItemForm)[]).some((key) => form[key] !== initial[key])
  const set = (patch: Partial<ItemForm>) => setForm((current) => ({ ...current, ...patch }))
  const inStock = item.quantity !== null && item.quantity > 0 && !item.is_staple
  const expiry = form.expiresOn ? expiryInfo(form.expiresOn, today) : null

  function save(event: React.FormEvent) {
    event.preventDefault()
    if (pending || gone) return
    if (errors.name || errors.quantity) {
      setShowErrors(true)
      return
    }
    const fields = changedFields(initial, form)
    if (Object.keys(fields).length === 0) {
      close()
      return
    }
    const before = item
    apply({ type: "patch", id: item.id, fields })
    startTransition(async () => {
      const result = await updateItem(item.id, fields)
      if (result.error !== undefined) {
        apply({ type: "upsert", item: before })
        toast.error(result.error)
        return
      }
      apply({ type: "upsert", item: result.item })
      toast.success(`Saved ${displayName(result.item.name)}`)
      close()
    })
  }

  function markRanOut() {
    const before = item
    apply({ type: "patch", id: item.id, fields: { quantity: 0 } })
    close()
    startTransition(async () => {
      const result = await updateItem(item.id, { quantity: 0 })
      if (result.error !== undefined) {
        apply({ type: "upsert", item: before })
        toast.error(result.error)
        return
      }
      apply({ type: "upsert", item: result.item })
      toast.success(`Moved ${item.name.trim()} to Ran out`)
    })
  }

  async function remove() {
    const result = await deleteItem(item.id)
    if (result.error === undefined) {
      close()
      apply({ type: "remove", id: item.id })
    }
    return result
  }

  return (
    <>
      <DrawerHeader className="gap-1 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">{name}</DrawerTitle>
        <DrawerDescription>
          {amountLabel(item)} · {categoryLabel(item.category)}
        </DrawerDescription>
        <p className="text-xs text-muted-foreground">
          {addedByLabel(item.created_by, members, viewerId)} · {timeAgo(item.created_at, now)}
        </p>
      </DrawerHeader>

      {gone ? (
        <div className="grid gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p role="status" className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            Someone in your household just removed this item.
          </p>
          <Button size="lg" variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto overscroll-contain px-4 pb-4" data-vaul-no-drag>
            {inStock ? (
              <UsedSome
                item={item}
                onUse={(delta) => {
                  adjust(item.id, delta, {
                    onDone: (quantity) => toast.success(remainingMessage(item.name, quantity, item.unit)),
                  })
                  close()
                }}
              />
            ) : null}
            {item.quantity === null && !item.is_staple ? (
              <Button type="button" variant="outline" size="lg" className="h-12 justify-start" onClick={markRanOut}>
                <CircleOff className="size-5" aria-hidden />
                We ran out
              </Button>
            ) : null}

            <form id={formId} onSubmit={save} className="grid grid-cols-1 gap-5" noValidate>
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
                    placeholder="On hand"
                    aria-invalid={shownErrors.quantity ? true : undefined}
                    aria-describedby={`${id}-quantity-hint`}
                    className="w-28 tabular-nums"
                  />
                  <UnitSelect aria-label="Unit" value={form.unit} onValueChange={(unit) => set({ unit })} className="flex-1" />
                </div>
                <FieldError>{shownErrors.quantity}</FieldError>
                <FieldDescription id={`${id}-quantity-hint`}>
                  Leave it empty for things you don&apos;t count.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor={`${id}-category`}>Category</FieldLabel>
                <CategorySelect
                  id={`${id}-category`}
                  value={form.category}
                  onValueChange={(category) => set({ category })}
                />
                {form.category !== initial.category ? (
                  <FieldDescription>We&apos;ll remember this for next time.</FieldDescription>
                ) : null}
              </Field>

              <div className="grid gap-2">
                <span className="text-sm font-medium" aria-hidden>
                  Expires
                </span>
                <ExpiryPicker value={form.expiresOn} onChange={(expiresOn) => set({ expiresOn })} today={today} />
                {expiry ? (
                  <p className="text-sm text-muted-foreground">
                    {expiry.label} · {shortDate(form.expiresOn)}
                  </p>
                ) : null}
              </div>

              <Field orientation="horizontal" className="items-center">
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-staple`}>Always on hand</FieldLabel>
                  <FieldDescription>For basics like salt: they count for recipes and aren&apos;t tracked.</FieldDescription>
                </FieldContent>
                <Switch
                  id={`${id}-staple`}
                  checked={form.isStaple}
                  onCheckedChange={(isStaple) => set({ isStaple })}
                />
              </Field>
            </form>
          </div>

          <DrawerFooter className="flex-row border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <ConfirmButton
              trigger={
                <Button type="button" variant="destructive" size="icon" className="size-12" aria-label={`Delete ${name}`}>
                  <Trash2 className="size-5" aria-hidden />
                </Button>
              }
              title={`Delete ${name}?`}
              description="It's removed from the pantry for everyone in your household."
              confirmLabel="Delete"
              destructive
              successMessage={`Deleted ${item.name.trim()}`}
              onConfirm={remove}
            />
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

/** "Used some": an amount in any unit, converted to the item's. */
function UsedSome({ item, onUse }: { item: PantryItem; onUse: (delta: number) => void }) {
  const id = useId()
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState(item.unit)
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = usedAmount(amount, unit, item.unit)
    if ("error" in result) {
      setError(result.error)
      return
    }
    onUse(result.delta)
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl bg-muted/60 p-3" noValidate>
      <label htmlFor={`${id}-amount`} className="text-sm font-medium">
        Used some?
      </label>
      <div className="flex gap-2">
        <Input
          id={`${id}-amount`}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value)
            setError(null)
          }}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="How much"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-28 bg-background tabular-nums"
        />
        <UnitSelect
          aria-label="Unit used"
          value={unit}
          onValueChange={(next) => {
            setUnit(next)
            setError(null)
          }}
          className="min-w-0 flex-1 [&>select]:bg-background"
        />
        <Button type="submit" size="lg" className="h-11" disabled={!amount.trim()}>
          Use
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
