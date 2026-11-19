import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { DISPLAY_NAME_MAX, validateDisplayName } from '@/lib/account';
import { friendlyError } from '@/lib/household-settings';
import { useHouseholdContext } from '@/lib/household';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { useTheme } from '@/theme';

import { useUpdateDisplayName } from '../api';
import { Avatar } from '@/components/Avatar';

/** Avatar, display name (editable) and email. */
export function ProfileCard() {
  const { colors, spacing, type } = useTheme();
  const context = useHouseholdContext();
  const update = useUpdateDisplayName();
  const name = context.data?.profile?.displayName ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(name);
    setError(null);
    update.reset();
    setEditing(true);
  };

  const save = () => {
    const result = validateDisplayName(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.name === name) {
      setEditing(false);
      return;
    }
    update.mutate(result.name, { onSuccess: () => setEditing(false) });
  };

  return (
    <SettingsCard
      title="Profile"
      action={!editing ? <PrimaryPillButton title="Edit" variant="text" onPress={start} accessibilityLabel="Edit your name" /> : null}
    >
      <View style={[styles.head, { gap: spacing.md }]}>
        <Avatar name={name} url={context.data?.profile?.avatarUrl ?? null} size={56} />
        <View style={styles.info}>
          <Text style={[type.titleSmall, { color: colors.ink }]} numberOfLines={2}>
            {name || 'Your name'}
          </Text>
          {context.data?.email ? (
            <Text style={[type.bodySmall, { color: colors.muted }]} numberOfLines={1}>
              {context.data.email}
            </Text>
          ) : null}
        </View>
      </View>
      {editing ? (
        <View style={{ gap: spacing.md }}>
          <TextField
            label="Display name"
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (error) setError(null);
            }}
            error={error}
            maxLength={DISPLAY_NAME_MAX}
            autoFocus
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          {update.isError ? <FormMessage tone="error" text={friendlyError(update.error)} /> : null}
          <View style={[styles.buttons, { gap: spacing.sm }]}>
            <View style={styles.grow}>
              <PrimaryPillButton title="Save" onPress={save} loading={update.isPending} />
            </View>
            <View style={styles.grow}>
              <PrimaryPillButton title="Cancel" variant="outline" onPress={() => setEditing(false)} disabled={update.isPending} />
            </View>
          </View>
        </View>
      ) : null}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, minWidth: 0 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexBasis: 120 },
});
