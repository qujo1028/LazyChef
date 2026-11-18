import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { isAppleSignInAvailable } from '@/lib/auth/apple';
import { useTheme } from '@/theme';

/**
 * Apple's own button (HIG), so it stays on brand. It renders only when the flag is on and the
 * device can show the Apple sheet.
 */
export function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { scheme, minTouch } = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={999}
      onPress={disabled ? () => {} : onPress}
      style={[styles.button, { height: minTouch + 6, opacity: disabled ? 0.5 : 1 }]}
    />
  );
}

const styles = StyleSheet.create({ button: { width: '100%' } });
