import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { RewardState } from '@/features/habit/use-reward';
import { useTheme } from '@/theme';

const PIECES = 28;

/**
 * The reward visuals, laid over the sheet body (never blocks touches). A ring pulse, a flame pop,
 * and confetti on milestones. Under reduce motion the ring and flame just appear, with no confetti.
 */
export function RewardBurst({ state }: { state: RewardState }) {
  if (state.kind === null) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.center}>
        {state.ring ? <Ring key={`ring-${state.run}`} still={state.reduceMotion} /> : null}
        {state.flame ? <Flame key={`flame-${state.run}`} still={state.reduceMotion} /> : null}
      </View>
      {state.confetti && !state.reduceMotion ? <Confetti key={`confetti-${state.run}`} /> : null}
    </View>
  );
}

function Ring({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const scale = useSharedValue(still ? 1 : 0.5);
  const opacity = useSharedValue(still ? 0.5 : 0.9);
  useEffect(() => {
    if (still) {
      opacity.value = withDelay(1000, withTiming(0, { duration: 300 }));
      return;
    }
    scale.value = withTiming(1.8, { duration: 600, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 600 });
  }, [still, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={[styles.ring, { borderColor: colors.accent }, style]} />;
}

function Flame({ still }: { still: boolean }) {
  const { colors } = useTheme();
  const scale = useSharedValue(still ? 1 : 0);
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (still) {
      opacity.value = withDelay(1000, withTiming(0, { duration: 300 }));
      return;
    }
    scale.value = withSequence(withSpring(1.3, { damping: 7 }), withSpring(1));
    opacity.value = withDelay(900, withTiming(0, { duration: 400 }));
  }, [still, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.flame, style]}>
      <Ionicons name="flame" size={56} color={colors.accent} />
    </Animated.View>
  );
}

function Confetti() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const palette = [colors.accent, colors.primary, colors.pill, colors.ink];
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        x: ((i * 37) % 100) / 100,
        drift: ((i * 53) % 80) - 40,
        delay: (i % 7) * 40,
        duration: 1100 + ((i * 29) % 6) * 100,
        spin: 180 + ((i * 71) % 360),
        size: 8 + (i % 3) * 3,
        color: palette[i % palette.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors],
  );
  return (
    <>
      {pieces.map((piece) => (
        <Piece key={piece.id} piece={piece} width={width} height={height} />
      ))}
    </>
  );
}

type PieceSpec = { x: number; drift: number; delay: number; duration: number; spin: number; size: number; color: string };

function Piece({ piece, width, height }: { piece: PieceSpec; width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: Easing.in(Easing.quad) }));
  }, [piece, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.8 ? 1 : (1 - t.value) / 0.2,
    transform: [
      { translateY: -20 + t.value * height * 0.7 },
      { translateX: t.value * piece.drift },
      { rotate: `${t.value * piece.spin}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.piece,
        { left: piece.x * width, width: piece.size, height: piece.size * 1.6, backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 4 },
  flame: { position: 'absolute' },
  piece: { position: 'absolute', top: 0, borderRadius: 2 },
});
