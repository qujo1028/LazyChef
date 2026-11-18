import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from './use-reduce-motion';

/** Light scale feedback for pressables. No motion when reduce motion is on. */
export function usePressScale(to = 0.97) {
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = useCallback(() => {
    if (!reduce) scale.set(withTiming(to, { duration: 120 }));
  }, [reduce, scale, to]);
  const onPressOut = useCallback(() => {
    if (!reduce) scale.set(withTiming(1, { duration: 160 }));
  }, [reduce, scale]);
  return { style, onPressIn, onPressOut };
}
