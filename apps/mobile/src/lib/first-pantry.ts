// Pure: turns the onboarding "What's in your kitchen?" answers into the p_items payload for
// public.add_pantry_items(). Same parser and categories as the web app's bulk add, without the
// Spoonacular top-up (unknown names get the keyword guess).
import { findIngredient, guessCategory, normalizeIngredientName } from '@lazychef/core/ingredients/catalog';
import { parseLines } from '@lazychef/core/ingredients/parse-line';
import { planAdditions, type PlanEntry } from '@lazychef/core/pantry/merge';
import { MAX_LINES } from '@lazychef/core/pantry/resolve-core';
import type { NewPantryItem } from '@lazychef/core/pantry/types';
import { convertQuantity, normalizeUnit } from '@lazychef/core/units';

/** Same limit as the web item name schema. */
const MAX_NAME_LENGTH = 80;

function toItem(name: string, quantity: number | null, unit: string, isStaple: boolean): NewPantryItem | null {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH).trim();
  if (!trimmed) return null;
  const entry = findIngredient(trimmed);
  return {
    name: trimmed,
    quantity,
    unit: normalizeUnit(unit) ?? unit,
    category: entry?.category ?? guessCategory(trimmed),
    expires_on: null,
    is_staple: isStaple,
    ingredient_id: entry?.id ?? null,
    category_changed: false,
  };
}

/** The names the typed text will add, in order (for a live "Adds 3 items" hint). */
export function typedItemNames(text: string): string[] {
  return parseLines(text)
    .slice(0, MAX_LINES)
    .map((line) => line.name.trim())
    .filter(Boolean);
}

/**
 * Typed lines ("2 lbs chicken, eggs" or one per line) plus tapped staples (on hand, not tracked)
 * become insert entries. Repeats fold together the way the web bulk add does ("eggs" and "6 eggs"
 * become one row of 6). A new household has nothing to top up, so every entry is an insert.
 */
export function buildFirstPantryEntries(text: string, staples: readonly string[]): PlanEntry[] {
  const typed = parseLines(text)
    .slice(0, MAX_LINES)
    .map((line) => toItem(line.name, line.quantity, line.unit, false));
  const tapped = staples.map((name) => toItem(name, null, 'count', true));
  const items = [...typed, ...tapped].filter((item): item is NewPantryItem => item !== null).slice(0, MAX_LINES);
  return planAdditions(items, [], { normalize: normalizeIngredientName, convert: convertQuantity }).entries;
}
