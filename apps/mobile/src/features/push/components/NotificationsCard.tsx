// The three push switches on the Account screen. Turning one on is "the first reminder": that is
// when the app explains, asks for notification permission and registers this phone (never at launch).
import { DEFAULT_PREFS, PREF_LABELS, type NotificationPrefs } from '@lazychef/core/push/prefs';
import * as Notifications from 'expo-notifications';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useToast } from '@/components/Toast';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { devNotification } from '@/lib/push-state';
import { useTheme } from '@/theme';

import { enablePush, readPushSetup, type PushSetup, type RegisterResult } from '../device';
import { useNotificationPrefs, useSetNotificationPref } from '../use-notification-prefs';

const NOTES: Partial<Record<RegisterResult, string>> = {
  unsupported: "Push doesn't work on a simulator or in the browser. Your choices still save.",
  no_project: "Push isn't set up for this build yet. Your choices still save.",
  failed: "Couldn't turn on notifications on this phone. Try again in a minute.",
};

export function NotificationsCard() {
  const { colors, spacing, type } = useTheme();
  const toast = useToast();
  const prefs = useNotificationPrefs();
  const save = useSetNotificationPref();
  const [result, setResult] = useState<RegisterResult | null>(null);

  const setupQuery = useQuery({
    queryKey: ['push-setup'],
    queryFn: (): Promise<PushSetup> =>
      Platform.OS === 'web' ? Promise.resolve({ status: 'unsupported', permission: 'undetermined' }) : readPushSetup(),
    networkMode: 'always',
    staleTime: 0,
  });
  const setup = setupQuery.data ?? null;
  const refreshSetup = () => void setupQuery.refetch();

  // No row (or no connection yet) means the defaults, which are all on.
  const values = prefs.data ?? (prefs.isError ? DEFAULT_PREFS : undefined);
  const status = result && result !== 'ok' && result !== 'offline' ? result : setup?.status;

  const toggle = async (key: keyof NotificationPrefs, on: boolean) => {
    if (!onlineManager.isOnline()) {
      toast.error(OFFLINE_ACTION_MESSAGE);
      return;
    }
    save.mutate(
      { [key]: on },
      { onError: () => toast.error("Couldn't save that. Check your connection and try again.") },
    );
    if (!on) return;
    // The first reminder: ask now, after the line above the switches explained why.
    const outcome = await enablePush();
    setResult(outcome);
    refreshSetup();
  };

  const note = status === 'denied' ? null : status ? NOTES[status] : null;
  const asking = setup?.status === 'ready' && setup.permission === 'undetermined';

  return (
    <SettingsCard
      title="Notifications"
      description={asking ? "We'll ask to send notifications the first time you turn one on." : undefined}
    >
      {PREF_LABELS.map((pref) => (
        <View key={pref.key} style={[styles.row, { gap: spacing.md, minHeight: 44 }]}>
          <View style={styles.fill}>
            <Text style={[type.body, styles.label, { color: colors.ink }]}>{pref.title}</Text>
            <Text style={[type.bodySmall, { color: colors.muted }]}>{pref.hint}</Text>
          </View>
          <Switch
            accessibilityLabel={pref.title}
            value={values?.[pref.key] ?? false}
            disabled={values === undefined}
            onValueChange={(on) => void toggle(pref.key, on)}
            trackColor={{ true: colors.primary }}
          />
        </View>
      ))}

      {prefs.isError ? (
        <Text style={[type.bodySmall, { color: colors.muted }]}>Couldn&apos;t load your choices. They&apos;ll show up when you&apos;re back online.</Text>
      ) : null}

      {status === 'denied' ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.bodySmall, { color: colors.muted }]}>
            Notifications are off for LazyChef on this phone. Turn them on in Settings to get reminders.
          </Text>
          <PrimaryPillButton title="Open Settings" variant="outline" onPress={() => void Linking.openSettings().catch(() => {})} />
        </View>
      ) : null}
      {note ? <Text style={[type.bodySmall, { color: colors.muted }]}>{note}</Text> : null}
      {result === 'offline' ? <Text style={[type.bodySmall, { color: colors.muted }]}>{OFFLINE_ACTION_MESSAGE}</Text> : null}

      {__DEV__ ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.bodySmall, { color: colors.muted }]}>Dev only: send a local notification (shows as a toast while the app is open).</Text>
          {PREF_LABELS.map((pref) => (
            <PrimaryPillButton
              key={pref.key}
              title={`Test: ${pref.key}`}
              variant="text"
              onPress={() => void fireLocal(pref.key, toast.error)}
            />
          ))}
        </View>
      ) : null}
    </SettingsCard>
  );
}

async function fireLocal(kind: keyof NotificationPrefs, onError: (message: string) => void) {
  if (Platform.OS === 'web') return onError('Local notifications need a phone.');
  try {
    const allowed = (await Notifications.getPermissionsAsync()).granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!allowed) return onError('Allow notifications first.');
    await Notifications.scheduleNotificationAsync({ content: devNotification(kind), trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 } });
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Could not schedule that.');
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fill: { flex: 1 },
  label: { fontWeight: '600' },
});
