import type { PantryItem } from '@lazychef/core/pantry/types';
import { useCallback } from 'react';

import { addToListMessage, type AddToListMessage } from '@/lib/add-to-list-message';

import { addListItems } from './api';
import { useList } from './list-provider';

/**
 * Puts a pantry item on the shopping list (any amount) and returns the toast text to show:
 * "Added eggs to the shopping list", "Eggs is already on the list", or an error. The caller
 * shows it (after its sheet has closed, see lib/after-close.ts). Port of the web app's
 * src/features/list/components/add-to-list.ts.
 */
export function useAddPantryItemToList() {
  const { householdId } = useList();
  return useCallback(
    async (item: Pick<PantryItem, 'name' | 'category' | 'ingredient_id'>): Promise<AddToListMessage> => {
      if (householdId === null) {
        return { message: "Your household isn't ready yet. Try again in a moment.", tone: 'error' };
      }
      const result = await addListItems(householdId, [
        { name: item.name, quantity: null, unit: null, category: item.category, ingredient_id: item.ingredient_id },
      ]);
      return addToListMessage(item.name, result);
    },
    [householdId],
  );
}
