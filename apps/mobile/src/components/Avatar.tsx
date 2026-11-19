import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { avatarPhotoUrl, initials } from '@/lib/account';
import { useTheme } from '@/theme';

type Props = { name: string | null | undefined; url: string | null; size?: number };

/**
 * The sign-in photo when there is a usable https one, otherwise initials on the pill colour (also
 * when the photo fails to load; a new photo gets a fresh try). Decorative: the row names the person.
 */
export function Avatar({ name, url, size = 40 }: Props) {
  const { colors, fonts } = useTheme();
  const photo = avatarPhotoUrl(url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = photo !== null && failedUrl !== photo;
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, box, { backgroundColor: colors.pill }]}
    >
      {showPhoto ? (
        <Image
          source={{ uri: photo }}
          style={box}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUrl(photo)}
          accessible={false}
        />
      ) : (
        <Text style={{ fontFamily: fonts.semibold, fontSize: Math.max(12, size * 0.38), color: colors.onPill }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
