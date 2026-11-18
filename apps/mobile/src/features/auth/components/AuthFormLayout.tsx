import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreenHeader } from '@/components/AppScreenHeader';
import { useTheme } from '@/theme';

type Props = {
  title: string;
  description?: string;
  /** Back button handler. Leave out on screens with nowhere to go back to. */
  onBack?: () => void;
  children: ReactNode;
};

/** Header, heading and a keyboard-safe scrolling body shared by the email auth screens. */
export function AuthFormLayout({ title, description, onBack, children }: Props) {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppScreenHeader title="" onBack={onBack} />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl + insets.bottom,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
            {title}
          </Text>
          {description ? <Text style={[type.body, { color: colors.muted }]}>{description}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
