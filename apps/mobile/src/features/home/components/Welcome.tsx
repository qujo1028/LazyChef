import Ionicons from '@expo/vector-icons/Ionicons';
import { expiringSoon } from '@lazychef/core/home/expiring';
import { greeting } from '@lazychef/core/home/greeting';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { usePantry } from '@/features/pantry/pantry-provider';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

/** Home's top: the greeting, the household name and (only when something expires within a week) a line that opens Pantry. */
export function Welcome({ displayName, householdName }: { displayName: string | null; householdName: string | null }) {
  const { colors, spacing, type, radius } = useTheme();
  const router = useRouter();
  const { items } = usePantry();
  const today = useToday();
  const now = useNow();
  const timeZone = deviceTimeZone();

  const hello = greeting(new Date(now), timeZone, displayName);
  const expiring = useMemo(() => expiringSoon(items.values(), today), [items, today]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
          {hello}
        </Text>
        {householdName ? <Text style={[type.body, { color: colors.muted }]}>{householdName}</Text> : null}
      </View>
      {expiring ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${expiring.text}. Open the pantry`}
          onPress={() => router.navigate('/pantry')}
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.pill,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[type.bodySmall, { color: colors.onPill, flex: 1 }]}>{expiring.text}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
