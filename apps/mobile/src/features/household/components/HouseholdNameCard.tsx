import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { friendlyError, HOUSEHOLD_NAME_MAX, validateHouseholdName } from '@/lib/household-settings';
import { useTheme } from '@/theme';

import { useRenameHousehold } from '../api';
import { SettingsCard } from './SettingsCard';

type Props = {
  householdId: string;
  name: string;
  memberCount: number | null;
  /** RLS only lets the owner rename. */
  canRename: boolean;
};

/** The household's name, with an inline rename for the owner. */
export function HouseholdNameCard({ householdId, name, memberCount, canRename }: Props) {
  const { colors, spacing, type } = useTheme();
  const rename = useRenameHousehold();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(name);
    setError(null);
    rename.reset();
    setEditing(true);
  };

  const save = () => {
    const result = validateHouseholdName(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.name === name) {
      setEditing(false);
      return;
    }
    rename.mutate({ householdId, name: result.name }, { onSuccess: () => setEditing(false) });
  };

  const members = memberCount === null ? null : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;

  return (
    <SettingsCard
      title="Household"
      action={
        canRename && !editing ? <PrimaryPillButton title="Rename" variant="text" onPress={start} accessibilityLabel="Rename household" /> : null
      }
    >
      {editing ? (
        <View style={{ gap: spacing.md }}>
          <TextField
            label="Household name"
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (error) setError(null);
            }}
            error={error}
            maxLength={HOUSEHOLD_NAME_MAX}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          {rename.isError ? <FormMessage tone="error" text={friendlyError(rename.error)} /> : null}
          <View style={[styles.buttons, { gap: spacing.sm }]}>
            <View style={styles.grow}>
              <PrimaryPillButton title="Save" onPress={save} loading={rename.isPending} />
            </View>
            <View style={styles.grow}>
              <PrimaryPillButton title="Cancel" variant="outline" onPress={() => setEditing(false)} disabled={rename.isPending} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.titleSmall, { color: colors.ink }]}>{name}</Text>
          {members ? <Text style={[type.bodySmall, { color: colors.muted }]}>{members}</Text> : null}
        </View>
      )}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexBasis: 120 },
});
