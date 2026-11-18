// Pure: small helpers for the list line edit sheet.
import { amountText } from '@lazychef/core/list/display';
import type { ListItem } from '@lazychef/core/list/types';

/** The line to put back when someone taps Undo after a delete. */
export function undoLine(item: ListItem) {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    ingredient_id: item.ingredient_id,
    note: item.note,
    recipe_id: item.recipe_id,
    recipe_title: item.recipe_title,
  };
}

/** The sheet's subtitle: "2 lb" (or "Any amount") plus where it came from, if a recipe added it. */
export function listSubtitle(item: Pick<ListItem, 'quantity' | 'unit' | 'recipe_title'>): string {
  const amount = amountText(item) || 'Any amount';
  return item.recipe_title ? `${amount} · For ${item.recipe_title}` : amount;
}
