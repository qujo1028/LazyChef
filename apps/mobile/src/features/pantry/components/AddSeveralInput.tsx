import { parseLines } from '@lazychef/core/ingredients/parse-line';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { addSeveralHint } from '@/lib/add-several-hint';
import { useTheme } from '@/theme';

const PLACEHOLDER = ['2 lbs chicken breast', '1 dozen eggs', 'milk', '3 cans black beans', 'a bunch of cilantro'].join('\n');
const LABEL = 'What did you get?';

/**
 * "Add several": a multi-line box for a whole shop ("2 lbs chicken, 6 eggs" or one per
 * line), with a live "N items" hint. A native multi-line TextInput keeps pasted line breaks
 * on its own, and React Native has no paste event to hook (the web's insertPastedLines turns
 * pasted lines into commas, which we do not need here), so plain text is enough.
 */
export function AddSeveralInput({
  value,
  onChange,
  error,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const { colors, radius, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const count = useMemo(() => (value.trim() ? parseLines(value).length : 0), [value]);
  const hint = addSeveralHint(count);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.bodySmall, styles.label, { color: colors.ink }]}>{LABEL}</Text>
      <TextInput
        multiline
        textAlignVertical="top"
        value={value}
        onChangeText={onChange}
        placeholder={PLACEHOLDER}
        placeholderTextColor={colors.muted}
        maxLength={5000}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoFocus={autoFocus}
        editable={!disabled}
        accessibilityLabel={LABEL}
        accessibilityHint={error ?? hint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          type.body,
          {
            minHeight: 160,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingTop: 12,
            paddingBottom: 12,
            color: colors.ink,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.outline,
            borderWidth: focused || error ? 2 : 1,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      />
      <Text accessibilityLiveRegion="polite" style={[type.bodySmall, { color: colors.muted }]}>
        {hint}
      </Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.bodySmall, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'SourceSans3_600SemiBold' },
});
