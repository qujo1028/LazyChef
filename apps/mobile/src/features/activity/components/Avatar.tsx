import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { initialsOf } from '@/lib/activity-screen';
import { useTheme } from '@/theme';

/** The sign-in photo, or initials when there is none (or it fails to load). Decorative: the row names the person. */
export function Avatar({ name, uri, size = 40 }: { name: string; uri: string | null; size?: number }) {
  const { colors, fonts } = useTheme();
  // Remember which photo failed, so a new photo gets a fresh try.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = uri !== null && failedUri === uri;
  const showPhoto = uri !== null && !failed;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.pill,
      }}
    >
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setFailedUri(uri)}
          accessible={false}
        />
      ) : (
        <Text style={{ fontFamily: fonts.semibold, fontSize: Math.max(12, size * 0.38), color: colors.onPill }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
