// W2 (feature/p3-list-edit) owns this file. Stub from the lead's step 0.
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';

import { useListItem } from '../list-provider';

/**
 * Tap a line: fix its name, amount and unit, aisle (category) or note, or delete it with
 * Undo. Reads the live line by id (null once a housemate deletes it or puts it away).
 */
export function ListEditSheet({ itemId, visible, onClose }: { itemId: string | null; visible: boolean; onClose: () => void }) {
  const item = useListItem(itemId);
  return (
    <Sheet visible={visible} onClose={onClose} title={item?.name ?? 'Item'}>
      <Text>Coming in W2.</Text>
    </Sheet>
  );
}
