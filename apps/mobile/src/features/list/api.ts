// Shopping list reads and writes, straight to Supabase as the signed-in user (RLS and the
// column grants on shopping_list_items apply). Same rules as the web app's
// src/features/list/actions.ts. Every write fails fast offline and returns { error }.
// New lines tell housemates through notifyHousemates (fire and forget; the server sends the push).
import { onlineManager } from '@tanstack/react-query';
import { z } from 'zod';

import { findIngredient, guessCategory, normalizeIngredientName } from '@lazychef/core/ingredients/catalog';
import { parseLines } from '@lazychef/core/ingredients/parse-line';
import type { Category } from '@lazychef/core/ingredients/types';
import { listUnit } from '@lazychef/core/list/display';
import { planListAdditions } from '@lazychef/core/list/plan';
import type { ActionResult, AddToListSummary, ListItem, ListItemFields, NewListLine } from '@lazychef/core/list/types';
import { categoryOverrides, planAdditions, roundQuantity } from '@lazychef/core/pantry/merge';
import { canonicalUnit, category, firstIssue, itemId, name, newItemSchema, quantity } from '@lazychef/core/pantry/schemas';
import type { AddItemsSummary, NewPantryItem } from '@lazychef/core/pantry/types';
import { convertQuantity } from '@lazychef/core/units';

import { dbErrorMessage } from '@/lib/db-error';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { notifyHousemates } from '@/features/push/notify';
import { supabase } from '@/lib/supabase';

export type { AddToListSummary, ListItem, ListItemFields };

const REMOVED = 'Someone already removed that item.';
const MAX_LINES = 100;
const PAGE = 1000;
const MAX_PANTRY_ROWS = 2000;

const unit = z.string().trim().max(24).nullable();
const note = z.string().trim().max(200, 'Keep notes under 200 characters.').nullable();

const lineSchema = z.object({
  name,
  quantity: quantity.nullable(),
  unit,
  /** Omit to work it out from the household's fixes and the ingredient library. */
  category: category.optional(),
  ingredient_id: z.number().int().positive().nullable().optional(),
  note: note.optional(),
  recipe_id: z.number().int().positive().nullable().optional(),
  recipe_title: z.string().trim().max(200).nullable().optional(),
});

export type ListLineInput = z.input<typeof lineSchema>;

const fieldsSchema = z.strictObject({
  name: name.optional(),
  quantity: quantity.positive('Amounts have to be more than 0.').nullable().optional(),
  unit: unit.optional(),
  category: category.optional(),
  note: note.optional(),
});

export type PutAwaySummary = AddItemsSummary & { cleared: number };

function offline(): { error: string } | null {
  return onlineManager.isOnline() ? null : { error: OFFLINE_ACTION_MESSAGE };
}

async function guard<T>(action: string, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    return { error: dbErrorMessage(action, error instanceof Error ? { message: error.message } : null) };
  }
}

/** Every line on the household's list (checked and not). Throws on error (it's a query function). */
export async function fetchListItems(householdId: string): Promise<ListItem[]> {
  const items: ListItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    items.push(...data);
    if (data.length < PAGE) return items;
  }
}

async function saveCategoryOverrides(householdId: string, overrides: { ingredient_key: string; category: Category }[]) {
  if (overrides.length === 0) return;
  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from('category_overrides')
    .upsert(
      overrides.map((o) => ({ household_id: householdId, ...o, updated_at })),
      { onConflict: 'household_id,ingredient_key' },
    );
  if (error && __DEV__) console.warn("[list] couldn't save category fixes:", error.message);
}

/** Categories for names: the household's own fixes first, then the ingredient library, then a guess. */
async function categoriesFor(householdId: string, names: string[]) {
  const keys = names.map((n) => normalizeIngredientName(n).slice(0, 80));
  const wanted = [...new Set(keys.filter(Boolean))];
  const { data } = wanted.length
    ? await supabase
        .from('category_overrides')
        .select('ingredient_key, category')
        .eq('household_id', householdId)
        .in('ingredient_key', wanted)
    : { data: [] as { ingredient_key: string; category: Category }[] };
  const fixed = new Map(data?.map((o) => [o.ingredient_key, o.category]));
  return names.map((n, i): { category: Category; ingredientId: number | null } => {
    const entry = findIngredient(n);
    return { category: fixed.get(keys[i]) ?? entry?.category ?? guessCategory(n), ingredientId: entry?.id ?? null };
  });
}

/** Plans the lines against what's already on the list (tops up instead of repeating) and adds them in one call. */
async function addLines(householdId: string, inputs: z.output<typeof lineSchema>[]): Promise<ActionResult<AddToListSummary>> {
  const [known, open] = await Promise.all([
    categoriesFor(
      householdId,
      inputs.map((i) => i.name),
    ),
    supabase
      .from('shopping_list_items')
      .select('id, name, quantity, unit, ingredient_id')
      .eq('household_id', householdId)
      .is('checked_at', null)
      .order('created_at'),
  ]);
  if (open.error) return { error: dbErrorMessage('Loading the list', open.error) };

  const lines: NewListLine[] = inputs.map((input, i) => ({
    name: input.name,
    quantity: input.quantity,
    unit: listUnit(input.unit === null ? null : canonicalUnit(input.unit)),
    category: input.category ?? known[i].category,
    ingredient_id: input.ingredient_id ?? known[i].ingredientId,
    note: input.note ?? null,
    recipe_id: input.recipe_id ?? null,
    recipe_title: input.recipe_title ?? null,
  }));
  const plan = planListAdditions(
    lines,
    open.data.map((line) => ({ ...line, quantity: line.quantity === null ? null : Number(line.quantity) })),
    { normalize: normalizeIngredientName, convert: convertQuantity },
  );

  let ids: string[] = [];
  if (plan.entries.length > 0) {
    const { data, error } = await supabase.rpc('add_to_shopping_list', {
      p_household_id: householdId,
      // The RPC takes jsonb; entries are plain JSON objects.
      p_items: plan.entries as never,
    });
    if (error) return { error: dbErrorMessage('add_to_shopping_list', error) };
    ids = (data ?? []).filter((_: string, i: number) => !('merge_into' in plan.entries[i]));
  }
  return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnList: plan.alreadyOnList, ids };
}

/** Tells housemates after a real new line (topping up an existing one isn't news). */
function announceAdded(householdId: string, result: ActionResult<AddToListSummary>): ActionResult<AddToListSummary> {
  if (result.error === undefined && result.added > 0) notifyHousemates({ event: 'list_added', householdId });
  return result;
}

/** Typed or pasted text ("2 lbs chicken breast, milk"). Library categories only. */
export async function addListText(householdId: string, text: string): Promise<ActionResult<AddToListSummary>> {
  const parsed = z
    .string()
    .trim()
    .min(1, 'Type something to add.')
    .max(5000, "That's a lot at once. Try a shorter list.")
    .safeParse(text);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const lines = parseLines(parsed.data)
    .slice(0, MAX_LINES)
    .filter((line) => line.name)
    .map((line) => ({ name: line.name.slice(0, 80), quantity: line.quantity, unit: line.unit }));
  if (lines.length === 0) return { error: 'Type something to add, like "2 lbs chicken breast".' };
  return offline() ?? announceAdded(householdId, await guard('addListText', () => addLines(householdId, lines)));
}

/** Structured lines: from the pantry ("Add to list"), a recipe, or Undo after a delete. */
export async function addListItems(
  householdId: string,
  lines: ListLineInput[],
  options: { notify?: boolean } = {},
): Promise<ActionResult<AddToListSummary>> {
  const parsed = z.array(lineSchema).min(1, 'Nothing to add.').max(MAX_LINES).safeParse(lines);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = offline() ?? (await guard('addListItems', () => addLines(householdId, parsed.data)));
  // Undo re-adds a line the person just removed: that isn't news for housemates, so it passes notify: false.
  return options.notify === false ? result : announceAdded(householdId, result);
}

/** Checks a line off (or back on). The database stamps who and when. */
export async function setChecked(householdId: string, id: string, checked: boolean): Promise<ActionResult<{ item: ListItem }>> {
  const parsedId = itemId.safeParse(id);
  if (!parsedId.success) return { error: firstIssue(parsedId.error) };
  return (
    offline() ??
    guard<{ item: ListItem }>('setChecked', async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .update({ checked_at: checked ? new Date().toISOString() : null })
        .eq('id', parsedId.data)
        .eq('household_id', householdId)
        .select()
        .maybeSingle();
      if (error) return { error: dbErrorMessage('setChecked', error) };
      if (!data) return { error: 'Someone already put that away or removed it.' };
      return { item: data };
    })
  );
}

/** Edits a line. Only send the fields that changed. A new category is remembered for the household. */
export async function updateListItem(
  householdId: string,
  id: string,
  fields: z.input<typeof fieldsSchema>,
): Promise<ActionResult<{ item: ListItem }>> {
  const parsedId = itemId.safeParse(id);
  if (!parsedId.success) return { error: firstIssue(parsedId.error) };
  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const changes: ListItemFields & { ingredient_id?: number | null } = { ...parsed.data };
  if (parsed.data.unit !== undefined) changes.unit = listUnit(parsed.data.unit === null ? null : canonicalUnit(parsed.data.unit));
  if (parsed.data.quantity != null) changes.quantity = roundQuantity(parsed.data.quantity);
  if (parsed.data.note !== undefined) changes.note = parsed.data.note || null;
  if (parsed.data.name !== undefined) changes.ingredient_id = findIngredient(parsed.data.name)?.id ?? null;
  if (Object.keys(changes).length === 0) return { error: 'Nothing to save.' };

  return (
    offline() ??
    guard<{ item: ListItem }>('updateListItem', async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .update(changes)
        .eq('id', parsedId.data)
        .eq('household_id', householdId)
        .select()
        .maybeSingle();
      if (error) return { error: dbErrorMessage('updateListItem', error) };
      if (!data) return { error: REMOVED };
      if (parsed.data.category !== undefined) {
        const key = normalizeIngredientName(data.name).slice(0, 80);
        if (key) await saveCategoryOverrides(householdId, [{ ingredient_key: key, category: parsed.data.category }]);
      }
      return { item: data };
    })
  );
}

export async function deleteListItems(householdId: string, ids: string[]): Promise<ActionResult> {
  const parsed = z.array(itemId).min(1).max(MAX_LINES).safeParse(ids);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return (
    offline() ??
    guard<object>('deleteListItems', async () => {
      const { error } = await supabase.from('shopping_list_items').delete().in('id', parsed.data).eq('household_id', householdId);
      if (error) return { error: dbErrorMessage('deleteListItems', error) };
      return {};
    })
  );
}

/**
 * Puts a trip away: takes `listItemIds` off the list and adds `items` to the pantry (topping
 * up what's there) in one transaction, logged as one "bought N items" entry. `items` can be
 * empty ("Clear without adding"). If a housemate already put some away, nothing changes.
 */
export async function putAway(
  householdId: string,
  listItemIds: string[],
  items: NewPantryItem[],
): Promise<ActionResult<PutAwaySummary>> {
  const parsedIds = z.array(itemId).min(1, 'Nothing to put away.').max(200).safeParse(listItemIds);
  if (!parsedIds.success) return { error: firstIssue(parsedIds.error) };
  const parsedItems = z.array(newItemSchema).max(200, 'Put away up to 200 items at a time.').safeParse(items);
  if (!parsedItems.success) return { error: firstIssue(parsedItems.error) };

  const incoming = parsedItems.data.map((item) => ({
    ...item,
    unit: canonicalUnit(item.unit),
    ingredient_id: item.ingredient_id ?? findIngredient(item.name)?.id ?? null,
  }));

  return (
    offline() ??
    guard<PutAwaySummary>('putAway', async () => {
      let plan = { entries: [] as unknown[], added: 0, toppedUp: 0, alreadyOnHand: 0 };
      if (incoming.length > 0) {
        const { data: existing, error: loadError } = await supabase
          .from('pantry_items')
          .select('id, name, quantity, unit, ingredient_id')
          .eq('household_id', householdId)
          .order('created_at')
          .limit(MAX_PANTRY_ROWS);
        if (loadError) return { error: dbErrorMessage('Loading the pantry', loadError) };
        plan = planAdditions(
          incoming,
          existing.map((item) => ({ ...item, quantity: item.quantity === null ? null : Number(item.quantity) })),
          { normalize: normalizeIngredientName, convert: convertQuantity },
        );
      }

      const ids = [...new Set(parsedIds.data)];
      const { error } = await supabase.rpc('complete_shopping_trip', {
        p_household_id: householdId,
        p_list_item_ids: ids,
        p_pantry_items: plan.entries as never,
      });
      if (error) return { error: dbErrorMessage('complete_shopping_trip', error) };

      await saveCategoryOverrides(householdId, categoryOverrides(incoming, normalizeIngredientName));
      return { added: plan.added, toppedUp: plan.toppedUp, alreadyOnHand: plan.alreadyOnHand, cleared: ids.length };
    })
  );
}
