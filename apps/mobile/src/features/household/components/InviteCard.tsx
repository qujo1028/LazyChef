import { formatInviteCode } from '@lazychef/core/household/invite';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { friendlyError, inviteShareContent, spellInviteCode } from '@/lib/household-settings';
import { useTheme } from '@/theme';

import { inviteLinkFor, useRegenerateInviteCode } from '../api';
import { SettingsCard } from './SettingsCard';

type Props = {
  householdId: string;
  householdName: string;
  inviteCode: string;
  isOwner: boolean;
};

/** The invite code, big enough to read out, with share, copy and (owner only) reset. */
export function InviteCard({ householdId, householdName, inviteCode, isOwner }: Props) {
  const { colors, radius, spacing, type, fonts } = useTheme();
  const regenerate = useRegenerateInviteCode();
  const [copied, setCopied] = useState(false);
  const pretty = formatInviteCode(inviteCode);

  // Clear the "Copied" label after a moment. Runs again (and restarts) on each copy.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(pretty);
      setCopied(true);
      AccessibilityInfo.announceForAccessibility('Invite code copied');
    } catch {
      Alert.alert("Couldn't copy", `The code is ${pretty}.`);
    }
  };

  const share = async () => {
    try {
      await Share.share(inviteShareContent(Platform.OS, householdName, inviteLinkFor(inviteCode)));
    } catch {
      Alert.alert("Couldn't open sharing", `Send this code instead: ${pretty}.`);
    }
  };

  const confirmReset = () => {
    Alert.alert('Reset the invite code?', 'The current code and link stop working. People already in the household stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset code',
        style: 'destructive',
        onPress: () =>
          regenerate.mutate(householdId, {
            onSuccess: () => AccessibilityInfo.announceForAccessibility('New invite code ready'),
            onError: (error) => Alert.alert("Couldn't reset the code", friendlyError(error)),
          }),
      },
    ]);
  };

  return (
    <SettingsCard title="Invite housemates" description="Anyone with the link or code can join this household.">
      <View
        accessible
        accessibilityLabel={`Invite code ${spellInviteCode(pretty)}`}
        style={[styles.codeBox, { backgroundColor: colors.pill, borderRadius: radius.md, padding: spacing.lg }]}
      >
        <Text selectable style={[type.title, styles.code, { color: colors.onPill, fontFamily: fonts.semibold }]}>
          {pretty}
        </Text>
      </View>
      <PrimaryPillButton title="Share invite" onPress={share} accessibilityLabel="Share invite link" />
      <PrimaryPillButton
        title={copied ? 'Copied' : 'Copy code'}
        variant="outline"
        onPress={copy}
        accessibilityLabel={copied ? 'Invite code copied' : 'Copy invite code'}
      />
      {isOwner ? (
        <PrimaryPillButton title="Reset code" variant="text" onPress={confirmReset} loading={regenerate.isPending} />
      ) : null}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  codeBox: { alignItems: 'center' },
  code: { letterSpacing: 4, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
