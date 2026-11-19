import Ionicons from '@expo/vector-icons/Ionicons';
import {
  describeItem,
  resolveActor,
  summarizeEntry,
  visibleItemCount,
  type ActivityEntry,
  type ActivityMember,
} from '@lazychef/core/activity/feed';
import { shortTime } from '@lazychef/core/dates/time';
import { useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { actionLook, entryLabel } from '@/lib/activity-screen';
import { useTheme, type ColorTokens } from '@/theme';

import { Avatar } from './Avatar';

type IconName = ComponentProps<typeof Ionicons>['name'];

function toneColor(tone: 'primary' | 'accent' | 'muted', colors: ColorTokens): string {
  return tone === 'primary' ? colors.primary : tone === 'accent' ? colors.accent : colors.muted;
}

type Props = {
  entry: ActivityEntry;
  viewerId: string;
  members: ReadonlyMap<string, ActivityMember>;
  now: number;
  timeZone: string;
};

/** One feed line: who did what, when, and for a batch the items underneath ("and 3 more" expands). */
export function ActivityEntryItem({ entry, viewerId, members, now, timeZone }: Props) {
  const { colors, spacing, type, minTouch } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const actor = resolveActor(entry.rows[0], viewerId, members);
  const summary = summarizeEntry(entry);
  const look = actionLook(summary.action);
  const time = shortTime(Date.parse(entry.createdAt), now, timeZone);

  const total = entry.rows.length;
  const collapsedCount = visibleItemCount(total);
  const shown = summary.grouped ? entry.rows.slice(0, expanded ? total : collapsedCount) : [];
  const hidden = total - collapsedCount;

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md }}>
      <View style={{ width: 44, height: 44 }}>
        <Avatar name={actor.name} uri={actor.avatarUrl} size={40} />
        <View
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.divider,
          }}
        >
          <Ionicons name={look.icon as IconName} size={12} color={toneColor(look.tone, colors)} />
        </View>
      </View>

      <View style={{ flex: 1, gap: spacing.xs }}>
        <View
          accessible
          accessibilityLabel={entryLabel(time, actor.label, summary.verb, summary.object, summary.detail)}
          style={{ gap: 2 }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Text style={[type.body, { color: colors.ink, flex: 1 }]}>
              <Text style={{ fontFamily: 'SourceSans3_700Bold' }}>{actor.label}</Text> {summary.verb}{' '}
              <Text style={{ fontFamily: summary.grouped ? 'SourceSans3_400Regular' : 'SourceSans3_600SemiBold' }}>
                {summary.object}
              </Text>
            </Text>
            <Text style={[type.meta, { color: colors.muted }]}>{time}</Text>
          </View>
          {summary.detail ? <Text style={[type.bodySmall, { color: colors.muted }]}>{summary.detail}</Text> : null}
        </View>

        {shown.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            {shown.map((row) => {
              const rowLook = actionLook(row.action);
              return (
                <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name={rowLook.icon as IconName} size={14} color={toneColor(rowLook.tone, colors)} />
                  <Text numberOfLines={1} style={[type.bodySmall, { color: colors.ink, flexShrink: 1 }]}>
                    {describeItem(row)}
                  </Text>
                  {summary.mixed && row.action !== summary.action ? (
                    <Text style={[type.meta, { color: colors.muted }]}>{row.action}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {summary.grouped && hidden > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Show fewer items' : `Show ${hidden} more items`}
            onPress={() => setExpanded((open) => !open)}
            style={{ minHeight: minTouch, justifyContent: 'center', alignSelf: 'flex-start' }}
          >
            <Text style={[type.button, { color: colors.primary }]}>{expanded ? 'Show less' : `and ${hidden} more`}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
