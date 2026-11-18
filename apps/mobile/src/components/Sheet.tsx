import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  visible: boolean;
  /** Swipe down, the Close button, or Android back. */
  onClose: () => void;
  title: string;
  /** A line under the title. */
  subtitle?: string;
  /** Something before the title, like the item's emoji. */
  leading?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body, above the keyboard (Save, Add). */
  footer?: ReactNode;
  /** False when the body manages its own scrolling (a FlatList). */
  scroll?: boolean;
  /** Called after the sheet has finished closing (iOS), e.g. to show a toast or reset state. */
  onDismiss?: () => void;
};

/**
 * A native page sheet (iOS) with a title row, a Close button, a scrolling body and an optional
 * pinned footer. Used for add and edit flows. Toasts render under it, so close it first.
 */
export function Sheet({ visible, onClose, title, subtitle, leading, children, footer, scroll = true, onDismiss }: Props) {
  const { colors, spacing, type, minTouch } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.fill, { backgroundColor: colors.background }]}
      >
        <View
          style={[
            styles.header,
            { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, borderBottomColor: colors.divider },
          ]}
        >
          {leading}
          <View style={styles.titles}>
            <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
              {title}
            </Text>
            {subtitle ? <Text style={[type.bodySmall, { color: colors.muted }]}>{subtitle}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.close, { minHeight: minTouch, minWidth: minTouch, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[type.button, { color: colors.primary }]}>Close</Text>
          </Pressable>
        </View>

        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: footer ? spacing.lg : spacing.lg + insets.bottom }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.fill}>{children}</View>
        )}

        {footer ? (
          <View
            style={[
              styles.footer,
              { padding: spacing.lg, paddingBottom: spacing.lg + insets.bottom, gap: spacing.sm, borderTopColor: colors.divider, backgroundColor: colors.background },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  titles: { flex: 1, gap: 2 },
  close: { alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
});
