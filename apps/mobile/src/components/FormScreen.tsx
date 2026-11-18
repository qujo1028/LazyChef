import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import { Screen } from './Screen';

/** A pushed screen that scrolls and lifts above the keyboard, so the field and button stay visible. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen belowTabBar={false}>{children}</Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
