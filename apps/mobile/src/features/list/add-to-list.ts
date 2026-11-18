// W4 (feature/p3-pantry-to-list) owns this file. Stub from the lead's step 0.
import type { PantryItem } from '@lazychef/core/pantry/types';
import { useCallback } from 'react';

/**
 * Puts a pantry item on the shopping list (any amount) and returns the toast text to show:
 * "Added eggs to the shopping list", "Eggs is already on the list", or an error. The caller
 * shows it (after its sheet has closed, see lib/after-close.ts). Port of the web app's
 * src/features/list/components/add-to-list.ts.
 */
export function useAddPantryItemToList() {
  return useCallback(
    async (item: Pick<PantryItem, 'name' | 'category' | 'ingredient_id'>): Promise<{ message: string; tone?: 'error' }> => ({
      message: `Not built yet: ${item.name}`,
    }),
    [],
  );
}
