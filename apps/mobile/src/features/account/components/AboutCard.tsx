import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsCard } from '@/features/household/components/SettingsCard';
import { webOrigin } from '@/lib/web-api';
import { useTheme } from '@/theme';

const LINKS = [
  { label: 'Privacy policy', path: '/privacy' },
  { label: 'Terms of use', path: '/terms' },
  { label: 'Support', path: '/support' },
] as const;

/** Legal and support pages (the live site) in the in-app browser, plus the app version. */
export function AboutCard() {
  const { colors, spacing, type, minTouch } = useTheme();
  const version = Constants.expoConfig?.version;
  return (
    <SettingsCard title="About">
      <View>
        {LINKS.map((link, index) => (
          <Pressable
            key={link.path}
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={() => void WebBrowser.openBrowserAsync(`${webOrigin()}${link.path}`)}
            style={({ pressed }) => [
              styles.row,
              { minHeight: minTouch, gap: spacing.md, backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
            ]}
          >
            <Text style={[type.body, styles.label, { color: colors.ink }]}>{link.label}</Text>
            <Ionicons name="open-outline" size={18} color={colors.muted} accessibilityElementsHidden />
          </Pressable>
        ))}
      </View>
      {version ? <Text style={[type.bodySmall, { color: colors.muted }]}>LazyChef {version}</Text> : null}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  label: { flex: 1 },
});
