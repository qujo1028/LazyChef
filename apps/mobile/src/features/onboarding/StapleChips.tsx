import { Pressable, Text, View } from 'react-native';

import { COMMON_STAPLES } from '@lazychef/core/pantry/staples';
import { useTheme } from '@/theme';

type Props = { selected: readonly string[]; onToggle: (name: string) => void };

/** Tappable common staples. Each is a toggle with a 44pt target. */
export function StapleChips({ selected, onToggle }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {COMMON_STAPLES.map(({ name }) => {
        const on = selected.includes(name);
        return (
          <Pressable
            key={name}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={name}
            onPress={() => onToggle(name)}
            style={{
              minHeight: minTouch,
              justifyContent: 'center',
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              borderWidth: on ? 2 : 1,
              borderColor: on ? colors.primary : colors.outline,
              backgroundColor: on ? colors.surfacePressed : colors.surface,
            }}
          >
            <Text style={[type.bodySmall, { color: colors.ink }]}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
