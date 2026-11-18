import { Alert, StyleSheet, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { MetadataPill } from '@/components/MetadataPill';
import { formatJoined, friendlyError, type HouseholdMember } from '@/lib/household-settings';
import { useTheme } from '@/theme';

import { useRemoveMember } from '../api';
import { SettingsCard } from './SettingsCard';

type Props = {
  householdId: string;
  members: HouseholdMember[];
  viewerId: string;
  isOwner: boolean;
};

/** Everyone in the household. The owner can remove other people. */
export function MembersCard({ householdId, members, viewerId, isOwner }: Props) {
  const { colors, spacing, type } = useTheme();
  const remove = useRemoveMember();

  const confirmRemove = (member: HouseholdMember) => {
    Alert.alert(
      `Remove ${member.displayName}?`,
      "They'll lose access to this household's pantry and shopping list. You can invite them back.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(
              { householdId, userId: member.userId },
              { onError: (error) => Alert.alert("Couldn't remove them", friendlyError(error)) },
            ),
        },
      ],
    );
  };

  return (
    <SettingsCard title="Members">
      <View>
        {members.map((member, index) => {
          const isYou = member.userId === viewerId;
          return (
            <View
              key={member.userId}
              style={[
                styles.row,
                { gap: spacing.md, paddingVertical: spacing.md },
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.pill }]} accessibilityElementsHidden>
                <Text style={[type.heading, { color: colors.onPill }]}>{member.displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[type.body, { color: colors.ink }]}>{member.displayName}</Text>
                <View style={[styles.pills, { gap: spacing.xs }]}>
                  <MetadataPill label={member.role === 'owner' ? 'Owner' : 'Member'} />
                  {isYou ? <MetadataPill label="You" /> : null}
                </View>
                <Text style={[type.bodySmall, { color: colors.muted }]}>{formatJoined(member.joinedAt)}</Text>
              </View>
              {isOwner && !isYou ? (
                <PrimaryPillButton
                  title="Remove"
                  variant="text"
                  accessibilityLabel={`Remove ${member.displayName}`}
                  onPress={() => confirmRemove(member)}
                  disabled={remove.isPending}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap' },
});
