import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Sheet } from './Sheet';

export type SelectOption<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  label: string;
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  /** Muted line under the field. */
  hint?: string;
  disabled?: boolean;
  /** Hide the visible label (when a row already labels it); it is still read out. */
  hideLabel?: boolean;
};

/** A labelled field that opens a sheet listing the options (the RN stand-in for a <select>). */
export function SelectField<V extends string>({ label, value, options, onChange, hint, disabled, hideLabel }: Props<V>) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? value;

  return (
    <View style={{ gap: spacing.xs }}>
      {hideLabel ? null : <Text style={[type.bodySmall, styles.label, { color: colors.ink }]}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        accessibilityHint="Opens a list to choose from"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          {
            minHeight: minTouch,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            borderColor: colors.outline,
            backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text numberOfLines={1} style={[type.body, styles.value, { color: colors.ink }]}>
          {current}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {hint ? <Text style={[type.bodySmall, { color: colors.muted }]}>{hint}</Text> : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title={label} scroll={false}>
        <FlatList
          data={options}
          keyExtractor={(option) => option.value}
          initialScrollIndex={Math.max(0, options.findIndex((option) => option.value === value))}
          getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    height: ROW,
                    paddingHorizontal: spacing.lg,
                    borderBottomColor: colors.divider,
                    backgroundColor: pressed ? colors.surfacePressed : 'transparent',
                  },
                ]}
              >
                <Text style={[type.body, styles.value, { color: colors.ink }]}>{item.label}</Text>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

const ROW = 52;

const styles = StyleSheet.create({
  label: { fontFamily: 'SourceSans3_600SemiBold' },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: 8 },
  value: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
