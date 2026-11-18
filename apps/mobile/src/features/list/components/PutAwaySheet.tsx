// W3 (feature/p3-put-away) owns this file. Stub from the lead's step 0.
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';

/**
 * "Put away N items": the checked lines as the pantry's review cards (amounts filled in,
 * add expiry dates), with "Adds to your ..." hints, then putAway(). "Clear without adding"
 * clears them without touching the pantry. Bump `session` each time it opens so it starts
 * from the lines checked right then.
 */
export function PutAwaySheet({ visible, onClose }: { visible: boolean; onClose: () => void; session: number }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Put away">
      <Text>Coming in W3.</Text>
    </Sheet>
  );
}
