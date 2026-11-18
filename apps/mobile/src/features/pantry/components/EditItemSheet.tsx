// W4 (feature/p2-edit) owns this file. Stub from the lead's step 0.
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';

import { usePantryItem } from '../pantry-provider';

/**
 * Tap an item: fix its name, amount, unit, category or expiry, mark it always on hand,
 * "Used some", "We ran out", or delete it. Reads the live row by id (null once a housemate
 * deletes it, then says so).
 */
export function EditItemSheet({ itemId, visible, onClose }: { itemId: string | null; visible: boolean; onClose: () => void }) {
  const item = usePantryItem(itemId);
  return (
    <Sheet visible={visible} onClose={onClose} title={item?.name ?? 'Item'}>
      <Text>Coming in W4.</Text>
    </Sheet>
  );
}
