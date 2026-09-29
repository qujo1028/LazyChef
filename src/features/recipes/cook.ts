// Pure: "I cooked this" on the client: the review sheet's choices, the deductions it sends,
// and what to show afterwards. The plan itself comes from cook-plan.ts on the server (it
// needs the ingredient library, which is too big to send to the browser).
import { roundQuantity } from "@/features/pantry/merge"
import { formatQuantityInput, parseQuantityInput } from "@/features/pantry/review"
import type { PantryItem } from "@/features/pantry/types"
import { formatQuantity } from "@/lib/units"

export type CookPantryItem = Pick<
  PantryItem,
  "id" | "name" | "quantity" | "unit" | "ingredient_id" | "is_staple" | "expires_on"
>

type Base = { index: number; original: string; name: string }

export type CookLine =
  /** A tracked pantry item and the amount to take out, in its unit. */
  | (Base & { kind: "deduct"; itemId: string; itemName: string; itemUnit: string; have: number; amount: number })
  /** A tracked item, but we can't tell how much: the person enters it (in the item's unit) or skips. */
  | (Base & { kind: "check"; itemId: string; itemName: string; itemUnit: string; have: number; reason: string })
  /** A staple or untracked item: nothing to take out, just listed. */
  | (Base & { kind: "untracked"; itemName: string })
  /** Not in the pantry (or it ran out). */
  | (Base & { kind: "missing" })
  /** Water, salt and the like, when the pantry doesn't list them. */
  | (Base & { kind: "basic" })

/** What the review sheet edits for each line with a pantry item to take from. */
export type CookChoice = { skip: boolean; amount: string }

/** Deduct lines start with their amount; "check" lines start skipped with an empty amount. */
export function initialChoices(lines: readonly CookLine[]): Record<number, CookChoice> {
  const choices: Record<number, CookChoice> = {}
  for (const line of lines) {
    if (line.kind === "deduct") choices[line.index] = { skip: false, amount: formatQuantityInput(line.amount) }
    else if (line.kind === "check") choices[line.index] = { skip: true, amount: "" }
  }
  return choices
}

export type Deduction = { item_id: string; amount: number }

/**
 * The deductions to send, or the lines that need fixing (by recipe index). A line that
 * isn't skipped needs an amount above 0.
 */
export function toDeductions(
  lines: readonly CookLine[],
  choices: Readonly<Record<number, CookChoice>>,
): { deductions: Deduction[]; errors: Record<number, string> } {
  const deductions: Deduction[] = []
  const errors: Record<number, string> = {}
  for (const line of lines) {
    if (line.kind !== "deduct" && line.kind !== "check") continue
    const choice = choices[line.index]
    if (!choice || choice.skip) continue
    const amount = parseQuantityInput(choice.amount)
    if (amount === undefined || amount === null || amount <= 0) {
      errors[line.index] = "Enter how much you used, or skip it."
      continue
    }
    deductions.push({ item_id: line.itemId, amount: roundQuantity(amount) })
  }
  return { deductions, errors }
}

/** "1 lb of your 2 lb" for the review sheet. */
export function haveLabel(line: Extract<CookLine, { kind: "deduct" | "check" }>): string {
  return `You have ${formatQuantity(line.have, line.itemUnit)}`
}

/** A row cook_recipe returned. */
export type CookResult = {
  item_id: string
  name: string
  unit: string
  quantity_before: number | null
  quantity_after: number | null
}

/** Amounts actually taken (it stops at 0), for Undo. */
export function undoAmounts(results: readonly CookResult[]): Deduction[] {
  const byItem = new Map<string, number>()
  for (const row of results) {
    if (row.quantity_before === null || row.quantity_after === null) continue
    const taken = Number(row.quantity_before) - Number(row.quantity_after)
    if (taken > 0) byItem.set(row.item_id, roundQuantity((byItem.get(row.item_id) ?? 0) + taken))
  }
  return [...byItem].map(([item_id, amount]) => ({ item_id, amount }))
}

/** Items that ran out because of this cook (once each). */
export function ranOut(results: readonly CookResult[]): { id: string; name: string }[] {
  const out = new Map<string, string>()
  for (const row of results) {
    if (row.quantity_after !== null && Number(row.quantity_after) === 0 && Number(row.quantity_before) > 0) {
      out.set(row.item_id, row.name)
    }
  }
  return [...out].map(([id, name]) => ({ id, name }))
}
