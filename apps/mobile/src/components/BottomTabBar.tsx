import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  pantry: { label: 'Pantry', icon: 'basket-outline', iconActive: 'basket' },
  recipes: { label: 'Recipes', icon: 'restaurant-outline', iconActive: 'restaurant' },
  home: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  list: { label: 'List', icon: 'checkbox-outline', iconActive: 'checkbox' },
  household: { label: 'Household', icon: 'people-outline', iconActive: 'people' },
};

const HOME_CIRCLE = 56;
const HOME_ROUTE = 'home';
const BAR_PAD_TOP = 6;
const LABEL_HEIGHT = 14;
// Home slot: circle, a 2px gap, the label, then 4px of air. The bar background starts below the
// part of the circle that sticks up, so the whole button stays inside the tab row's bounds
// (Android only delivers touches inside a parent's bounds).
const HOME_SLOT = HOME_CIRCLE + 2 + LABEL_HEIGHT + 4;

/**
 * Five tabs, olive when active and muted otherwise. Home is a raised round button in the middle.
 * Padded by the bottom safe-area inset.
 */
export function BottomTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, type, fonts, minTouch } = useTheme();
  const lift = HOME_SLOT - BAR_PAD_TOP - minTouch;
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.row, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.barBackground,
          { top: Math.max(lift, 0), backgroundColor: colors.surface, borderTopColor: colors.divider },
        ]}
      />
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const tint = focused ? colors.tabActive : colors.tabInactive;
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptic('tap');
            navigateToTab(route.key);
          }
        };
        const onLongPress = () => emitter.emit({ type: 'tabLongPress', target: route.key });
        const label = (
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={[type.tabLabel, { color: tint, fontFamily: focused ? fonts.semibold : fonts.medium }]}
          >
            {meta.label}
          </Text>
        );
        if (route.name === HOME_ROUTE) {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.homeSlot}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.homeCircle,
                      {
                        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
                        borderColor: colors.surface,
                        shadowColor: colors.ink,
                      },
                    ]}
                  >
                    <Ionicons name={focused ? meta.iconActive : meta.icon} size={28} color={colors.onPrimary} />
                  </View>
                  {label}
                </>
              )}
            </Pressable>
          );
        }
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[styles.tab, { minHeight: minTouch }]}
          >
            <Ionicons name={focused ? meta.iconActive : meta.icon} size={24} color={tint} />
            {label}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible' },
  barBackground: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: BAR_PAD_TOP },
  homeSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 4 },
  homeCircle: {
    width: HOME_CIRCLE,
    height: HOME_CIRCLE,
    borderRadius: HOME_CIRCLE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
});
