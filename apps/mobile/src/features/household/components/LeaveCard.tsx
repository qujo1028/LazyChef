import { Alert } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { friendlyError, leaveCopy } from '@/lib/household-settings';

import { useLeaveHousehold } from '../api';
import { SettingsCard } from './SettingsCard';

type Props = {
  householdId: string;
  householdName: string;
  /** Null while the member list is loading. */
  memberCount: number | null;
  isOwner: boolean;
};

/** Leave the household. After the last one, the route gate sends the person to onboarding. */
export function LeaveCard({ householdId, householdName, memberCount, isOwner }: Props) {
  const leave = useLeaveHousehold();

  const confirm = () => {
    // Unknown count: assume others are in it, so the copy never promises a delete that may not happen.
    const copy = leaveCopy({ householdName, memberCount: memberCount ?? 2, isOwner });
    Alert.alert(copy.title, copy.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: copy.confirm,
        style: 'destructive',
        onPress: () =>
          leave.mutate(householdId, { onError: (error) => Alert.alert("Couldn't leave", friendlyError(error)) }),
      },
    ]);
  };

  return (
    <SettingsCard title="Leave household">
      <PrimaryPillButton title="Leave household" variant="danger" onPress={confirm} loading={leave.isPending} />
    </SettingsCard>
  );
}
