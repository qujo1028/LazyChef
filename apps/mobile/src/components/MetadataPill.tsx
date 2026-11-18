import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** Small capsule for metadata such as "20 min" or "Serves 4". Not interactive. */
export function MetadataPill({ label }: { label: string }) {
  const { colors, radius, type } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.pill, borderRadius: radius.pill }]}>
      <Text style={[type.meta, { color: colors.onPill }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4 },
});
