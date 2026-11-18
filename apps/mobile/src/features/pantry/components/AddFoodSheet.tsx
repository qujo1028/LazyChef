// W2 (feature/p2-add-food) owns this file. Stub from the lead's step 0.
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';

/** Text to start the sheet with; bump `n` to apply it (e.g. "Add 'oat milk'" from a search with no match). */
export type AddFoodSeed = { text: string; n: number };

/**
 * The one way to add food: a quick-add line with autocomplete, an "Add several" mode
 * (AddSeveralInput, W3), then a review step (ReviewList, W3), then addItems().
 * On success it closes and shows a toast (describeAdditions).
 */
export function AddFoodSheet({ visible, onClose }: { visible: boolean; onClose: () => void; seed: AddFoodSeed }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Add food">
      <Text>Coming in W2.</Text>
    </Sheet>
  );
}
