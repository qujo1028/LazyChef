import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown under the field in the danger colour, and read out with the label. */
  error?: string | null;
  /** Muted helper line under the field when there is no error. */
  hint?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

/** Labelled input on a surface, with the control outline (3:1) and an inline error. 16px text, 44pt tall. */
export function TextField({ label, error, hint, ref, ...input }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.bodySmall, styles.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.muted}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          type.body,
          styles.input,
          {
            minHeight: minTouch,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.outline,
            borderWidth: focused || error ? 2 : 1,
          },
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.bodySmall, { color: colors.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[type.bodySmall, { color: colors.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'SourceSans3_600SemiBold' },
  input: { paddingVertical: 10 },
});
