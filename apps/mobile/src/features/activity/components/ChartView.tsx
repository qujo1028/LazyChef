import { buildHeatmap, type HeatmapRow } from '@lazychef/core/habit/heatmap';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useHouseholdCooks } from '@/features/habit/use-habit';
import { heatmapIsEmpty, type DevBoardData } from '@/lib/activity-screen';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme';

import { CookHeatmap } from './CookHeatmap';
import { QueryScroll } from './StatusBlock';

/** Activity: Chart. The cook calendar for the whole household, in the device's time zone. */
export function ChartView({ householdId, dev }: { householdId: string | null; dev: DevBoardData | null }) {
  const { colors, spacing, type, radius } = useTheme();
  const query = useHouseholdCooks(householdId);
  const now = useNow();
  const timeZone = deviceTimeZone();

  const rows = useMemo<HeatmapRow[]>(
    () =>
      dev
        ? dev.rows
        : (query.data ?? []).map((r) => ({ action: 'cooked', actorId: r.actorId, batchId: r.batchId, createdAt: r.createdAt })),
    [dev, query.data],
  );
  const heatmap = useMemo(() => buildHeatmap(rows, now, timeZone), [rows, now, timeZone]);

  return (
    <QueryScroll query={dev ? { ...query, data: rows } : query} loadingLabel="Loading the cook calendar">
      <CookHeatmap heatmap={heatmap} />
      {heatmapIsEmpty(heatmap) ? (
        <View
          style={{
            gap: spacing.sm,
            padding: spacing.lg,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.outline,
          }}
        >
          <Text style={[type.heading, { color: colors.ink }]}>No cooks yet</Text>
          <Text style={[type.body, { color: colors.muted }]}>
            Tap &quot;I cooked this&quot; on a recipe and each cook day fills in a square.
          </Text>
        </View>
      ) : null}
    </QueryScroll>
  );
}
