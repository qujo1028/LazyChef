import type { Heatmap, HeatmapCell } from '@lazychef/core/habit/heatmap';
import { Text, View } from 'react-native';

import { Card } from '@/components/Card';
import {
  heatmapCaption,
  heatmapSummary,
  LEVEL_OPACITY,
  VISIBLE_WEEKDAY_ROWS,
  WEEKDAY_NAMES,
} from '@/lib/activity-screen';
import { useTheme } from '@/theme';

const GAP = 3;
const LABEL_WIDTH = 34;

/** 16 weeks of cook days: a row per weekday (Monday first), newest week on the right. One spoken summary, not a label per tile. */
export function CookHeatmap({ heatmap }: { heatmap: Heatmap }) {
  const { colors, type } = useTheme();

  const tile = (cell: HeatmapCell) => {
    const base = {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 3,
    } as const;
    if (cell.future) return { ...base, borderWidth: 1, borderColor: colors.divider };
    if (cell.level === 0) return { ...base, backgroundColor: colors.pill };
    return { ...base, backgroundColor: colors.primary, opacity: LEVEL_OPACITY[cell.level] };
  };

  return (
    <Card>
      <Text style={[type.bodySmall, { color: colors.muted }]}>{heatmapCaption(heatmap)}</Text>
      <View accessible accessibilityRole="image" accessibilityLabel={heatmapSummary(heatmap)} style={{ gap: GAP }}>
        {WEEKDAY_NAMES.map((weekday, row) => (
          <View key={weekday} style={{ flexDirection: 'row', alignItems: 'center', gap: GAP }}>
            <Text style={[type.tabLabel, { width: LABEL_WIDTH, color: colors.muted }]}>
              {VISIBLE_WEEKDAY_ROWS.has(row) ? weekday : ''}
            </Text>
            {heatmap.weeks.map((week) => (
              <View key={week[row].day} style={tile(week[row])} />
            ))}
          </View>
        ))}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}
      >
        <Text style={[type.tabLabel, { color: colors.muted }]}>Fewer</Text>
        {([0, 1, 2, 3] as const).map((level) => (
          <View
            key={level}
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              backgroundColor: level === 0 ? colors.pill : colors.primary,
              opacity: level === 0 ? 1 : LEVEL_OPACITY[level],
            }}
          />
        ))}
        <Text style={[type.tabLabel, { color: colors.muted }]}>More</Text>
      </View>
    </Card>
  );
}
