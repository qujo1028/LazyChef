import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/theme';

export type ToastOptions = {
  message: string;
  /** "error" uses the danger colour for the edge. */
  tone?: 'default' | 'error';
  /** One action, like Undo. Pressing it also closes the toast. */
  action?: { label: string; onPress: () => void };
  /** Replaces a showing toast with the same id instead of queueing behind it (e.g. repeated "-1" taps). */
  id?: string;
};

type Shown = ToastOptions & { key: number };

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Tab bar (about 64pt) plus a gap, so the toast sits just above it. */
const ABOVE_TAB_BAR = 80;
const DURATION_MS = 4000;
const DURATION_WITH_ACTION_MS = 6000;

/**
 * One toast at a time at the bottom of the screen, above the tab bar. A new toast replaces
 * the current one. Toasts render under native modals, so close a sheet before showing one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const counter = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    setToast({ ...options, key: counter.current });
    AccessibilityInfo.announceForAccessibility(options.message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id ?? toast.key} toast={toast} onClose={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: Shown; onClose: () => void }) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(200)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + ABOVE_TAB_BAR, paddingHorizontal: spacing.lg }]}
    >
      <View
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            gap: spacing.md,
            borderRadius: radius.md,
            paddingLeft: spacing.lg,
            paddingRight: toast.action ? spacing.xs : spacing.lg,
            minHeight: minTouch + 8,
            backgroundColor: colors.ink,
            borderLeftWidth: toast.tone === 'error' ? 4 : 0,
            borderLeftColor: colors.danger,
          },
        ]}
      >
        <Text style={[type.body, styles.message, { color: colors.background }]}>{toast.message}</Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              toast.action?.onPress();
            }}
            style={({ pressed }) => [
              styles.action,
              { minHeight: minTouch, minWidth: minTouch, borderRadius: radius.sm, paddingHorizontal: spacing.md, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[type.button, { color: colors.pill }]}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** show({ message, action: { label: 'Undo', onPress } }). Must be inside ToastProvider (AppProviders mounts it). */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return useMemo(
    () => ({
      show,
      error: (message: string) => show({ message, tone: 'error' }),
    }),
    [show],
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
  toast: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  message: { flex: 1, paddingVertical: 6 },
  action: { alignItems: 'center', justifyContent: 'center' },
});
