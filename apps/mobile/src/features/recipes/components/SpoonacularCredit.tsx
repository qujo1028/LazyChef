import { Linking, Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** Spoonacular's terms ask for a visible credit wherever their data shows. */
export function SpoonacularCredit() {
  const { colors, spacing, type, minTouch } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingTop: spacing.md }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Powered by Spoonacular"
        onPress={() => void Linking.openURL('https://spoonacular.com/food-api').catch(() => {})}
        style={{ minHeight: minTouch, justifyContent: 'center' }}
      >
        <Text style={[type.bodySmall, { color: colors.muted }]}>Powered by Spoonacular</Text>
      </Pressable>
    </View>
  );
}
