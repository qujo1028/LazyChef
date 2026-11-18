// Pantry reads and writes, straight to Supabase as the signed-in user (RLS and the column
// grants on pantry_items apply). Same rules as the web app's src/features/pantry/actions.ts.
// Every write fails fast offline and returns { error } instead of throwing, so screens can
// show the message in a toast.
import { onlineManager } from '@tanstack/react-query';
import { z } from 'zod';

import { findIngredient, guessCategory, normalizeIngredientName } from '@lazychef/core/ingredients/catalog';
import { categoryFromAisle } from '@lazychef/core/ingredients/aisles';
import { parseLines } from '@lazychef/core/ingredients/parse-line';
import type { Category, ResolvedItem } from '@lazychef/core/ingredients/types';
import { categoryOverrides, planAdditions, roundQuantity } from '@lazychef/core/pantry/merge';
import { buildHouseholdKnowledge, MAX_LINES, resolveParsedLines } from '@lazychef/core/pantry/resolve-core';
import {
  canonicalUnit,
  category,
  date,
  firstIssue,
  itemId,
  name,
  newItemSchema,
  quantity,
  unit,
} from '@lazychef/core/pantry/schemas';
import type {
  ActionResult,
  AddItemsSummary,
  NewPantryItem,
  PantryItem,
  PantryItemFields,
} from '@lazychef/core/pantry/types';
import { convertQuantity } from '@lazychef/core/units';

import { dbErrorMessage } from '@/lib/db-error';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { supabase } from '@/lib/supabase';

export type { ActionResult, AddItemsSummary, NewPantryItem, PantryItem, PantryItemFields };

const REMOVED = 'Someone already removed that item.';

/** PostgREST returns at most 1000 rows per request, so the pantry is read in pages. */
const PAGE = 1000;
/** Enough for any real pantry; only name/category/id are read when resolving. */
const MAX_PANTRY_ROWS = 2000;

const fieldsSchema = z.strictObject({
  name: name.optional(),
  quantity: quantity.nullable().optional(),
  unit: unit.optional(),
  category: category.optional(),
  expires_on: date.nullable().optional(),
  is_staple: z.boolean().optional(),
});

function offline(): { error: string } | null {
  return onlineManager.isOnline() ? null : { error: OFFLINE_ACTION_MESSAGE };
}

/** A thrown network error (fetch failed) as a result. */
async function guard<T>(action: string, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    return { error: dbErrorMessage(action, error instanceof Error ? { message: error.message } : null) };
  }
}

/** Everything in the household's pantry, by name. Throws on error (it's a query function). */
export async function fetchPantryItems(householdId: string): Promise<PantryItem[]> {
  const items: PantryItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', householdId)
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    items.push(...data);
    if (data.length < PAGE) return items;
  }
}

/** Remembers the household's category fixes. Never fails the caller: a missed fix isn't worth it. */
async function saveCategoryOverrides(householdId: string, overrides: { ingredient_key: string; category: Category }[]) {
  if (overrides.length === 0) return;
  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('category_overrides')
    .upsert(
      overrides.map((o) => ({ household_id: householdId, ...o, updated_at })),
      { onConflict: 'household_id,ingredient_key' },
    );
  if (error && __DEV__) console.warn("[pantry] couldn't save category fixes:", error.message);
}

/** Tops up what's already there, inserts the rest, in one transaction (one activity entry). */
async function addToPantry(householdId: string, items: NewPantryItem[]): Promise<ActionResult<AddItemsSummary>> {
  const { data: existing, error: loadError } = await supabase
    .from('pantry_items')
    .select('id, name, quantity, unit, ingredient_id')
    .eq('household_id', householdId)
    .order('created_at')
    .limit(MAX_PANTRY_ROWS);
  if (loadError) return { error: dbErrorMessage('Loading the pantry', loadError) };

  const plan = planAdditions(items, existing, { normalize: normalizeIngredientName, convert: convertQuantity });
  if (plan.entries.length > 0) {
    const { error } = await supabase.rpc('add_pantry_items', { p_household_id: householdId, p_items: plan.entries });
    if (error) return { error: dbErrorMessage('add_pantry_items', error) };
  }

  await saveCategoryOverrides(householdId, categoryOverrides(items, normalizeIngredientName));
  return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnHand: plan.alreadyOnHand };
}

/**
 * Typed or pasted text as items to review. Categories come from the household's own fixes and
 * pantry, then the built-in library, then a keyword guess. No Spoonacular lookup on mobile yet
 * (that needs an Edge Function), so unusual names get the guess and the user can fix it.
 */
export async function previewItems(householdId: string, text: string): Promise<ActionResult<{ items: ResolvedItem[] }>> {
  const parsed = z
    .string()
    .trim()
    .min(1, 'Type something to add.')
    .max(5000, "That's a lot at once. Try a shorter list.")
    .safeParse(text);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const lines = parseLines(parsed.data).slice(0, MAX_LINES);
  if (lines.length === 0) return { error: 'Type something to add, like "2 lbs chicken breast".' };

  const keys = [...new Set(lines.map((line) => normalizeIngredientName(line.name)).filter((key) => key && key.length <= 80))];

  // Offline, the household's own fixes can't be read, but the library still works.
  let overrides: { ingredient_key: string; category: Category }[] = [];
  let pantry: { name: string; category: Category; ingredient_id: number | null }[] = [];
  if (onlineManager.isOnline()) {
    try {
      const [o, p] = await Promise.all([
        keys.length > 0
          ? supabase
              .from('category_overrides')
              .select('ingredient_key, category')
              .eq('household_id', householdId)
              .in('ingredient_key', keys)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('pantry_items')
          .select('name, category, ingredient_id')
          .eq('household_id', householdId)
          .order('updated_at', { ascending: false })
          .limit(MAX_PANTRY_ROWS),
      ]);
      overrides = o.data ?? [];
      pantry = p.data ?? [];
    } catch {
      // Fall back to the library alone.
    }
  }

  const result = await resolveParsedLines(lines, {
    deps: { normalize: normalizeIngredientName, findIngredient, guessCategory, categoryFromAisle },
    knowledge: buildHouseholdKnowledge(overrides, pantry, normalizeIngredientName),
    lookup: null,
  });
  return { items: result.items };
}

/** Adds reviewed items, topping up matching ones. Returns counts for a toast (see describeAdditions). */
export async function addItems(householdId: string, items: NewPantryItem[]): Promise<ActionResult<AddItemsSummary>> {
  const parsed = z.array(newItemSchema).min(1, 'Nothing to add.').max(100, 'Add up to 100 items at a time.').safeParse(items);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return (
    offline() ??
    guard('addItems', () =>
      addToPantry(
        householdId,
        parsed.data.map((item) => ({
          ...item,
          unit: canonicalUnit(item.unit),
          ingredient_id: item.ingredient_id ?? findIngredient(item.name)?.id ?? null,
        })),
      ),
    )
  );
}

/** One-tap staples (salt, olive oil, ...): always on hand, not tracked. Skips ones you have. */
export async function addStaples(householdId: string, names: string[]): Promise<ActionResult<AddItemsSummary>> {
  const parsed = z.array(name).min(1, 'Pick at least one staple.').max(30).safeParse(names);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return (
    offline() ??
    guard('addStaples', async () => {
      const keys = parsed.data.map(normalizeIngredientName);
      const { data: overrides } = await supabase
        .from('category_overrides')
        .select('ingredient_key, category')
        .eq('household_id', householdId)
        .in('ingredient_key', keys);
      const fixed = new Map(overrides?.map((o) => [o.ingredient_key, o.category]));
      return addToPantry(
        householdId,
        parsed.data.map((staple, i) => {
          const entry = findIngredient(staple);
          return {
            name: staple,
            quantity: null,
            unit: 'count',
            category: fixed.get(keys[i]) ?? entry?.category ?? guessCategory(staple),
            expires_on: null,
            is_staple: true,
            ingredient_id: entry?.id ?? null,
            category_changed: false,
          };
        }),
      );
    })
  );
}

/** Edits an item. Only send the fields that changed (see changedFields). A new category is remembered. */
export async function updateItem(
  householdId: string,
  id: string,
  fields: PantryItemFields,
): Promise<ActionResult<{ item: PantryItem }>> {
  const parsedId = itemId.safeParse(id);
  if (!parsedId.success) return { error: firstIssue(parsedId.error) };
  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const changes: PantryItemFields & { ingredient_id?: number | null } = { ...parsed.data };
  if (parsed.data.unit !== undefined) changes.unit = canonicalUnit(parsed.data.unit);
  if (parsed.data.quantity != null) changes.quantity = roundQuantity(parsed.data.quantity);
  // A renamed item may be a different ingredient now.
  if (parsed.data.name !== undefined) changes.ingredient_id = findIngredient(parsed.data.name)?.id ?? null;
  if (Object.keys(changes).length === 0) return { error: 'Nothing to save.' };

  return (
    offline() ??
    guard<{ item: PantryItem }>('updateItem', async () => {
      const { data, error } = await supabase
        .from('pantry_items')
        .update(changes)
        .eq('id', parsedId.data)
        .eq('household_id', householdId)
        .select()
        .maybeSingle();
      if (error) return { error: dbErrorMessage('updateItem', error) };
      if (!data) return { error: REMOVED };

      if (parsed.data.category !== undefined) {
        const key = normalizeIngredientName(data.name).slice(0, 80);
        if (key) await saveCategoryOverrides(householdId, [{ ingredient_key: key, category: parsed.data.category }]);
      }
      return { item: data };
    })
  );
}

/**
 * Changes the amount relative to what's there now (so housemates' changes compose), never
 * below 0. Returns the whole updated row so the list keeps it over an older snapshot.
 */
export async function adjustQuantity(id: string, delta: number): Promise<ActionResult<{ item: PantryItem }>> {
  const parsedId = itemId.safeParse(id);
  if (!parsedId.success) return { error: firstIssue(parsedId.error) };
  const parsedDelta = z
    .number()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((d) => d !== 0, 'Enter an amount.')
    .safeParse(delta);
  if (!parsedDelta.success) return { error: firstIssue(parsedDelta.error) };

  return (
    offline() ??
    guard<{ item: PantryItem }>('adjustQuantity', async () => {
      const { data, error } = await supabase.rpc('adjust_pantry_quantity', {
        p_item_id: parsedId.data,
        p_delta: parsedDelta.data,
      });
      if (error) return { error: dbErrorMessage('adjust_pantry_quantity', error) };
      // null when the item is gone (or not visible to us).
      if (data === null || data === undefined) return { error: REMOVED };

      const { data: item, error: readError } = await supabase.from('pantry_items').select().eq('id', parsedId.data).maybeSingle();
      if (readError) return { error: dbErrorMessage('Reading the item', readError) };
      if (!item) return { error: REMOVED };
      return { item };
    })
  );
}

export async function deleteItem(householdId: string, id: string): Promise<ActionResult> {
  const parsedId = itemId.safeParse(id);
  if (!parsedId.success) return { error: firstIssue(parsedId.error) };
  return (
    offline() ??
    guard<object>('deleteItem', async () => {
      const { error } = await supabase.from('pantry_items').delete().eq('id', parsedId.data).eq('household_id', householdId);
      if (error) return { error: dbErrorMessage('deleteItem', error) };
      return {};
    })
  );
}
