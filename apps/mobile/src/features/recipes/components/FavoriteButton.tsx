import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

type Props = {
  saved: boolean;
  /** The recipe's title, for the spoken label. */
  title: string;
  onToggle: () => void;
};

/** The heart (paprika) on recipe cards: 44pt target, a small pulse when saving unless reduce motion is on. */
export function FavoriteButton({ saved, title, onToggle }: Props) {
  const { colors, minTouch } = useTheme();
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const wasSaved = useRef(saved);

  useEffect(() => {
    // Pulse on a change to saved, whoever made it (a housemate's heart too).
    if (saved && !wasSaved.current && !reduce) {
      scale.set(withSequence(withTiming(1.25, { duration: 120 }), withTiming(1, { duration: 160 })));
    }
    wasSaved.current = saved;
  }, [saved, reduce, scale]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `Remove ${title} from saved` : `Save ${title}`}
      accessibilityState={{ selected: saved }}
      hitSlop={4}
      onPress={() => {
        haptic('tap');
        onToggle();
      }}
      style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={style}>
        <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={colors.accent} />
      </Animated.View>
    </Pressable>
  );
}
