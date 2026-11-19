import { weekDayKeys } from '@lazychef/core/habit/week';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { dayDotLabel, ringFill, ringLabel, WEEKDAY_LETTERS } from '@/lib/week-card';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 84;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * RADIUS;

/** Cook days this week against the goal: an olive ring with the count inside, and the Mon to Sun dots. */
export function WeekRing({ cooks, goal }: { cooks: number; goal: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const fill = ringFill(cooks, goal);
  const progress = useSharedValue(reduceMotion ? fill : 0);

  useEffect(() => {
    progress.value = reduceMotion ? fill : withTiming(fill, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [fill, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: LENGTH * (1 - progress.value) }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={ringLabel(cooks, goal)}
      style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={colors.pill} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - fill)}
          animatedProps={animatedProps}
          // Start at 12 o'clock.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={{ fontFamily: 'SourceSans3_700Bold', fontSize: 22, lineHeight: 26, color: colors.ink }}>{cooks}</Text>
        <Text style={{ fontFamily: 'SourceSans3_500Medium', fontSize: 12, lineHeight: 16, color: colors.muted }}>
          of {goal}
        </Text>
      </View>
    </View>
  );
}

/** The seven day dots, Monday to Sunday. */
export function WeekDots({ today, days }: { today: string; days: ReadonlySet<string> }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityLabel="Days this week">
      {weekDayKeys(today).map((day, i) => {
        const cooked = days.has(day);
        const isToday = day === today;
        const letter = WEEKDAY_LETTERS[i];
        return (
          <View key={day} accessible accessibilityLabel={dayDotLabel(letter, cooked, isToday)} style={{ alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: isToday && !cooked ? 2 : 1,
                borderColor: cooked || isToday ? colors.primary : colors.outline,
                backgroundColor: cooked ? colors.primary : 'transparent',
              }}
            >
              {cooked ? <Text style={{ color: colors.onPrimary, fontSize: 14, lineHeight: 18 }}>✓</Text> : null}
            </View>
            <Text
              style={{
                fontFamily: isToday ? 'SourceSans3_700Bold' : 'SourceSans3_500Medium',
                fontSize: 12,
                lineHeight: 16,
                color: isToday ? colors.ink : colors.muted,
              }}
            >
              {letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
