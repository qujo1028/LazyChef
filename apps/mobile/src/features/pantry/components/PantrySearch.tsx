import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

/** Search field with a magnifier and a clear (X) button, 44pt tall. */
export function PantrySearch({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  return (
    <View
      style={{
        minHeight: minTouch,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        paddingLeft: spacing.md,
      }}
    >
      <Ionicons name="search" size={18} color={colors.muted} accessibilityElementsHidden />
      <TextInput
        accessibilityLabel="Search the pantry"
        placeholder="Search the pantry"
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        style={[type.body, { flex: 1, color: colors.ink, paddingHorizontal: spacing.sm, paddingVertical: 10 }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChange('')}
          style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
