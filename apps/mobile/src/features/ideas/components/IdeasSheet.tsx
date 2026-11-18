// STUB (P5 step 0). W2 builds the Ideas sheet: the single AI entry point (docs/product-scope.md).
// Opened from the Ideas button in the Recipes header (IdeasButton). Keep these props.
import { Text } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { useTheme } from '@/theme';

export function IdeasSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, type } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Ideas" subtitle="Recipe ideas from what you have.">
      <Text style={[type.body, { color: colors.muted }]}>Coming soon.</Text>
    </Sheet>
  );
}
