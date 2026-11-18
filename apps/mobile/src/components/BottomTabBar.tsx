import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  pantry: { label: 'Pantry', icon: 'basket-outline', iconActive: 'basket' },
  recipes: { label: 'Recipes', icon: 'restaurant-outline', iconActive: 'restaurant' },
  list: { label: 'List', icon: 'checkbox-outline', iconActive: 'checkbox' },
  household: { label: 'Household', icon: 'home-outline', iconActive: 'home' },
};

/** Four tabs, olive when active and muted otherwise. Padded by the bottom safe-area inset. */
export function BottomTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, type, fonts, minTouch } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.divider,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const tint = focused ? colors.tabActive : colors.tabInactive;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            style={[styles.tab, { minHeight: minTouch }]}
          >
            <Ionicons name={focused ? meta.iconActive : meta.icon} size={24} color={tint} />
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[type.tabLabel, { color: tint, fontFamily: focused ? fonts.semibold : fonts.medium }]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
