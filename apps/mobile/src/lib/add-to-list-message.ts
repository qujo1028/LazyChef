import type { ActionResult, AddToListSummary } from '@lazychef/core/list/types';
import { displayName } from '@lazychef/core/pantry/display';

export type AddToListMessage = { message: string; tone?: 'error' };

/**
 * The toast text for "Add to shopping list" from the pantry. Pure, so it can be tested.
 * Port of the web's addPantryItemToList messages.
 */
export function addToListMessage(name: string, result: ActionResult<AddToListSummary>): AddToListMessage {
  if (result.error !== undefined) return { message: result.error, tone: 'error' };
  if (result.added > 0) return { message: `Added ${displayName(name).toLowerCase()} to the shopping list` };
  return { message: `${displayName(name)} is already on the list` };
}
