import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name for the group, e.g. "Activity view". */
  label: string;
};

/** A pill-shaped switch between a few views. Each segment is a 44pt target and reads as a tab. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  const { colors, radius, type, minTouch } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.pill }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: minTouch,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: colors.divider,
            }}
          >
            <Text style={[type.button, { color: selected ? colors.ink : colors.muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
