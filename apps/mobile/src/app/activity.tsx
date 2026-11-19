import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { useActiveHousehold } from '@/lib/household';
import { BoardView } from '@/features/activity/components/BoardView';
import { ChartView } from '@/features/activity/components/ChartView';
import { ActivityLog } from '@/features/activity/components/ActivityLog';
import { SegmentedControl } from '@/features/activity/components/SegmentedControl';
import { useHouseholdMembers } from '@/features/household/api';
import {
  ACTIVITY_VIEWS,
  DEV_BOARD_PRESETS,
  devBoardData,
  type ActivityView,
  type DevBoardPreset,
} from '@/lib/activity-screen';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useSession } from '@/lib/use-session';
import { DEV_PRESETS, type DevPreset } from '@/lib/week-card';
import { useTheme } from '@/theme';

/** Activity (opened from the header icon): Log, Chart and Board on one screen. The view is local state. */
export default function ActivityScreen() {
  const { colors, spacing } = useTheme();
  const { household } = useActiveHousehold();
  const householdId = household?.id ?? null;
  const { session } = useSession();
  const viewerId = session?.user.id ?? '';
  const [view, setView] = useState<ActivityView>('log');

  // Dev only: preview Chart and Board states without waiting days. Display only, never saved.
  const [devBoard, setDevBoard] = useState<DevBoardPreset | null>(null);
  const [devGoal, setDevGoal] = useState<DevPreset | null>(null);

  const membersData = useHouseholdMembers(householdId).data;
  const viewerName = membersData?.find((m) => m.userId === viewerId)?.displayName ?? 'You';
  const viewerAvatar = membersData?.find((m) => m.userId === viewerId)?.avatarUrl ?? null;
  const now = useNow();
  const dev = useMemo(
    () =>
      __DEV__ && devBoard
        ? devBoardData(devBoard, { userId: viewerId, displayName: viewerName, avatarUrl: viewerAvatar }, now, deviceTimeZone())
        : null,
    [devBoard, viewerId, viewerName, viewerAvatar, now],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md }}>
      <SegmentedControl label="Activity view" options={ACTIVITY_VIEWS} value={view} onChange={setView} />
      {__DEV__ && view !== 'log' ? (
        <DevPanel board={devBoard} onBoard={setDevBoard} goal={devGoal} onGoal={setDevGoal} showGoal={view === 'board'} />
      ) : null}
      <View style={{ flex: 1 }}>
        {view === 'log' ? <ActivityLog householdId={householdId} viewerId={viewerId} /> : null}
        {view === 'chart' ? <ChartView householdId={householdId} dev={dev} /> : null}
        {view === 'board' ? <BoardView householdId={householdId} viewerId={viewerId} dev={dev} devGoalPreset={devGoal} /> : null}
      </View>
    </View>
  );
}

function DevPanel({
  board,
  onBoard,
  goal,
  onGoal,
  showGoal,
}: {
  board: DevBoardPreset | null;
  onBoard: (p: DevBoardPreset | null) => void;
  goal: DevPreset | null;
  onGoal: (p: DevPreset | null) => void;
  showGoal: boolean;
}) {
  const { colors, spacing, type } = useTheme();
  const [open, setOpen] = useState(false);
  const on = board !== null || goal !== null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((o) => !o)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[type.meta, { color: colors.muted }]}>
          {open ? 'Hide dev preview' : 'Dev preview'}
          {on ? ' (on)' : ''}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {DEV_BOARD_PRESETS.map(({ label, preset }) => (
              <Chip key={preset} label={label} selected={board === preset} onPress={() => onBoard(preset)} />
            ))}
          </View>
          {showGoal ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {DEV_PRESETS.map(({ label, preset }) => (
                <Chip key={label} label={label} onPress={() => onGoal(preset)} />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label="Reset"
              onPress={() => {
                onBoard(null);
                onGoal(null);
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
