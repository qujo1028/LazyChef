import { Text } from 'react-native';

import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { memberCountLine } from '@/lib/invite-code';
import { useTheme } from '@/theme';

type Props = {
  heading: string;
  householdName: string;
  memberCount: number;
  error: string | null;
  joining: boolean;
  onJoin: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
};

/** "You're invited to X" / "Join X?" with the member count, used by onboarding and the join link. */
export function InviteCard({ heading, householdName, memberCount, error, joining, onJoin, secondaryLabel, onSecondary }: Props) {
  const { colors, type, spacing } = useTheme();
  return (
    <Card>
      <Text style={[type.meta, { color: colors.muted }]}>{heading}</Text>
      <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
        {householdName}
      </Text>
      <Text style={[type.body, { color: colors.muted, marginBottom: spacing.xs }]}>{memberCountLine(memberCount, 'shares')}</Text>
      {error ? <FormMessage tone="error" text={error} /> : null}
      <PrimaryPillButton title={`Join ${householdName}`} onPress={onJoin} loading={joining} />
      <PrimaryPillButton title={secondaryLabel} onPress={onSecondary} variant="text" disabled={joining} />
    </Card>
  );
}
