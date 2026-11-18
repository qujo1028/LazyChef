import { appleDisplayName, bytesToHex, isNewAppleOnlyAccount } from '@lazychef/core/auth/apple';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '../supabase';

import { friendlyAuthError } from './errors';
import type { SocialResult } from './google';

/** Off until the Apple Developer account and the Supabase Apple provider are set up. */
export const appleFlagOn = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === '1';

/** True only on an iOS device that can show the Apple sheet, with the flag on. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !appleFlagOn) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * The native Apple sheet. Apple gets the SHA-256 of a random nonce and puts it in the ID token;
 * Supabase gets the raw nonce and checks the two match.
 */
export async function signInWithApple(): Promise<SocialResult> {
  try {
    const rawNonce = bytesToHex(Crypto.getRandomBytes(32));
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return { status: 'error', message: "Apple sign-in didn't come through. Try again." };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error || !data.user) return { status: 'error', message: friendlyAuthError(error) };

    // Apple shares the name only on the very first sign-in. Save it for an account Apple just
    // made, and leave an existing account's name alone (same rule as the web app).
    const name = appleDisplayName(credential.fullName?.givenName, credential.fullName?.familyName);
    if (name && isNewAppleOnlyAccount(data.user)) {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: name, full_name: name } });
      if (metadataError) console.warn('Saving the Apple name to user metadata failed', metadataError.message);
      const { error: profileError } = await supabase.from('profiles').update({ display_name: name }).eq('id', data.user.id);
      if (profileError) console.warn('Saving the Apple name to the profile failed', profileError.message);
    }
    return { status: 'done' };
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
      return { status: 'cancelled' };
    }
    return { status: 'error', message: friendlyAuthError(error) };
  }
}
