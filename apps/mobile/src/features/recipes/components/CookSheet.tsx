// W3 (feature/p4-cook) owns this file. Stub from the lead's step 0.
import type { RecipeIngredient } from '@lazychef/core/recipes/recipe-shapes';
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';

export type CookRecipe = {
  /** A Spoonacular id ("715538") or a local recipe uuid (see parseRecipeRef). */
  ref: string;
  title: string;
  ingredients: readonly RecipeIngredient[];
  /** Servings the ingredients are written for, if known (for scaling later). */
  servings?: number | null;
};

/**
 * "I cooked this": plans what comes out of the pantry (planCook), lets the cook fix amounts
 * or skip lines, then cook_recipe() in one transaction, with Undo (undo_cook), the reward
 * (haptic on every cook, confetti on milestones) and a done view with "Add to list" for
 * anything that ran out.
 */
export function CookSheet({ visible, onClose, recipe }: { visible: boolean; onClose: () => void; recipe: CookRecipe }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="I cooked this">
      <Text>W3 builds the cook sheet for {recipe.title}.</Text>
    </Sheet>
  );
}
