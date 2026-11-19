import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarPhotoUrl, initials } from '@/lib/account';
import { useTheme } from '@/theme';

type Props = { name: string; url: string | null; size?: number };

/** The sign-in photo when there is an https one, otherwise initials on the palette pill colour. Decorative. */
export function Avatar({ name, url, size = 56 }: Props) {
  const { colors, type } = useTheme();
  const photo = avatarPhotoUrl(url);
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, box, { backgroundColor: colors.pill }]}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={box} contentFit="cover" transition={150} />
      ) : (
        <Text style={[type.heading, { color: colors.onPill, fontSize: size * 0.4, lineHeight: size * 0.5 }]}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
