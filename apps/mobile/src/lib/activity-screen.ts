// Pure helpers for the Activity screen (Log, Chart, Board). No React Native imports so Vitest can run them.
import {
  groupActivity,
  type ActivityAction,
  type ActivityEntry,
  type ActivityRow,
} from '@lazychef/core/activity/feed';
import { addDays } from '@lazychef/core/activity/stats';
import { dayKey, groupByDay } from '@lazychef/core/dates/time';
import type { CookRow } from '@lazychef/core/habit/cook-days';
import type { Heatmap, HeatmapCell, HeatmapRow } from '@lazychef/core/habit/heatmap';
import type { BoardMember } from '@lazychef/core/habit/leaderboard';
import type { Json } from '@lazychef/core/db';

export type ActivityView = 'log' | 'chart' | 'board';

export const ACTIVITY_VIEWS: { value: ActivityView; label: string }[] = [
  { value: 'log', label: 'Log' },
  { value: 'chart', label: 'Chart' },
  { value: 'board', label: 'Board' },
];

export type BoardMode = 'week' | 'allTime';

export const BOARD_MODES: { value: BoardMode; label: string }[] = [
  { value: 'week', label: 'Weekly' },
  { value: 'allTime', label: 'All time' },
];

// ── Log ──────────────────────────────────────────────────────────────────

/** One activity_log row as PostgREST returns it with the actor's profile joined in. */
export type RawActivityRow = {
  id: number | string;
  actor_id: string | null;
  action: ActivityAction;
  item_name: string;
  quantity: number | string | null;
  unit: string | null;
  batch_id: number | string;
  details: Json;
  created_at: string;
  actor: { display_name: string; avatar_url: string | null } | null;
};

export function toActivityRow(raw: RawActivityRow): ActivityRow {
  return {
    id: Number(raw.id),
    actorId: raw.actor_id,
    actor: raw.actor ? { name: raw.actor.display_name, avatarUrl: raw.actor.avatar_url } : null,
    action: raw.action,
    itemName: raw.item_name,
    quantity: raw.quantity === null ? null : Number(raw.quantity),
    unit: raw.unit,
    batchId: Number(raw.batch_id),
    details: raw.details,
    createdAt: raw.created_at,
  };
}

export type LogRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'entry'; key: string; entry: ActivityEntry };

/** The feed as one flat list: a day heading, then that day's entries (newest first). */
export function buildLogRows(rows: readonly ActivityRow[], now: number, timeZone?: string): LogRow[] {
  const entries = groupActivity([...rows]);
  const out: LogRow[] = [];
  for (const day of groupByDay(entries, (entry) => Date.parse(entry.createdAt), now, timeZone)) {
    out.push({ kind: 'day', key: `day:${day.key}`, label: day.label });
    for (const entry of day.items) out.push({ kind: 'entry', key: entry.key, entry });
  }
  return out;
}

export type ActionLook = { icon: string; tone: 'primary' | 'accent' | 'muted' };

/** Icon (Ionicons name) and color family for each kind of change. Cooking gets the paprika accent. */
export function actionLook(action: ActivityAction): ActionLook {
  switch (action) {
    case 'added':
      return { icon: 'add', tone: 'primary' };
    case 'restocked':
      return { icon: 'refresh', tone: 'primary' };
    case 'used':
      return { icon: 'remove', tone: 'muted' };
    case 'updated':
      return { icon: 'pencil', tone: 'muted' };
    case 'removed':
      return { icon: 'trash', tone: 'muted' };
    case 'cooked':
      return { icon: 'restaurant', tone: 'accent' };
    case 'shopped':
      return { icon: 'bag-handle', tone: 'primary' };
    default:
      return { icon: 'pencil', tone: 'muted' };
  }
}

/** Spoken text for one feed entry: "2h ago. You cooked Chicken Tikka Masala". */
export function entryLabel(time: string, actorLabel: string, verb: string, object: string, detail: string | null): string {
  return `${time}. ${actorLabel} ${verb} ${object}${detail ? `. ${detail}` : ''}`;
}

// ── Chart ────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export { WEEKDAY_NAMES };
/** Only these weekday rows get a visible label; the heatmap's own label covers the rest. */
export const VISIBLE_WEEKDAY_ROWS: ReadonlySet<number> = new Set([0, 2, 4]);

/** 0 is a plain tile, 1 to 3 are olive at growing strength. */
export const LEVEL_OPACITY: Record<HeatmapCell['level'], number> = { 0: 1, 1: 0.35, 2: 0.65, 3: 1 };

export function cellDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function cellLabel(cell: HeatmapCell): string {
  const date = cellDate(cell.day);
  if (cell.future) return `${date}: upcoming`;
  if (cell.cooks === 0) return `${date}: no cook`;
  return `${date}: ${cell.cooks === 1 ? '1 meal cooked' : `${cell.cooks} meals cooked`}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Cook days (days with at least one cook) across the whole grid. */
export function heatmapCookDays(heatmap: Heatmap): number {
  let n = 0;
  for (const week of heatmap.weeks) for (const cell of week) if (cell.cooks > 0) n += 1;
  return n;
}

/** The line above the grid: "Cooked on 9 of the last 28 days". */
export function heatmapCaption(heatmap: Heatmap): string {
  return `Cooked on ${heatmap.cookDaysLast28} of the last 28 days`;
}

/** One label for the whole grid, instead of a hundred tiny ones. */
export function heatmapSummary(heatmap: Heatmap): string {
  const weeks = heatmap.weeks.length;
  const total = heatmapCookDays(heatmap);
  const all = heatmap.weeks.flat();
  const busiest = all.reduce<HeatmapCell | null>((best, cell) => (cell.cooks > (best?.cooks ?? 0) ? cell : best), null);
  const parts = [
    `Cook calendar, last ${weeks} weeks.`,
    `${heatmapCaption(heatmap)}.`,
    total === 0 ? 'No cooks yet.' : `${plural(total, 'cook day')} in all.`,
  ];
  if (busiest && busiest.cooks > 1) parts.push(`Busiest day ${cellDate(busiest.day)} with ${busiest.cooks} meals.`);
  return parts.join(' ');
}

/** True when the grid has nothing to show. */
export function heatmapIsEmpty(heatmap: Heatmap): boolean {
  return heatmapCookDays(heatmap) === 0;
}

// ── Board ────────────────────────────────────────────────────────────────

export function boardDays(n: number, atLeast = false): string {
  return `${n}${atLeast ? '+' : ''} ${n === 1 && !atLeast ? 'day' : 'days'}`;
}

/** Bar width as a percentage of the leader's count (a sliver for anyone above zero). */
export function barPercent(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(100, Math.max(6, (count / max) * 100));
}

export function boardRowLabel(
  rank: number,
  name: string,
  isViewer: boolean,
  count: number,
  wonLastWeek: boolean,
  atLeast: boolean,
): string {
  return `${rank}. ${isViewer ? `${name}, you` : name}, ${boardDays(count, atLeast)}${wonLastWeek ? ', won last week' : ''}`;
}

export function boardPeriodNote(mode: BoardMode): string {
  return mode === 'week' ? 'Cook days this week. Resets Monday.' : 'Cook days since you started.';
}

// ── Dev only: preview Chart and Board states without waiting days. Never touches the database. ──

export type DevBoardPreset = 'nobody' | 'quiet' | 'busy' | 'tie' | 'solo';

export const DEV_BOARD_PRESETS: { label: string; preset: DevBoardPreset }[] = [
  { label: 'Nobody cooked', preset: 'nobody' },
  { label: 'Quiet week', preset: 'quiet' },
  { label: 'Busy household', preset: 'busy' },
  { label: 'Tie', preset: 'tie' },
  { label: 'Just you', preset: 'solo' },
];

export type DevBoardData = {
  members: BoardMember[];
  /** Cook rows, newest first is not required. */
  rows: (HeatmapRow & CookRow)[];
};

const DEV_PEOPLE = [
  { id: 'dev-alex', name: 'Alex Rivera' },
  { id: 'dev-sam', name: 'Sam Okafor' },
  { id: 'dev-jo', name: 'Jo Lindqvist' },
  { id: 'dev-pat', name: 'Pat Moreau' },
];

/** Days-ago lists per person (0 is today), so each preset reads at a glance. */
const DEV_COOK_DAYS: Record<DevBoardPreset, number[][]> = {
  nobody: [[], [], []],
  quiet: [[1], [9, 16], []],
  busy: [
    [0, 1, 2, 3, 5, 8, 9, 10, 12, 15, 20, 22, 23, 29, 35, 36, 40, 50, 60],
    [0, 2, 4, 7, 9, 14, 16, 21, 28, 30, 44],
    [1, 3, 8, 15, 18, 19, 27, 33],
    [6, 13, 20, 34, 41, 55],
  ],
  tie: [
    [0, 1, 9, 10, 17],
    [0, 2, 8, 12, 20],
    [1, 2, 9, 11],
  ],
  solo: [[0, 1, 3, 4, 8, 10, 15, 22]],
};

/** Fake members and cook rows for a preset. `viewerId` takes the first slot, so "you" is on the board. */
export function devBoardData(preset: DevBoardPreset, viewer: BoardMember, now: number, timeZone?: string): DevBoardData {
  const today = dayKey(now, timeZone);
  const cookDays = DEV_COOK_DAYS[preset];
  const others = DEV_PEOPLE.slice(0, cookDays.length - 1).map((p) => ({
    userId: p.id,
    displayName: p.name,
    avatarUrl: null,
  }));
  const members: BoardMember[] = [viewer, ...others];
  const rows: (HeatmapRow & CookRow)[] = [];
  let batchId = 1;
  members.forEach((member, i) => {
    for (const ago of cookDays[i] ?? []) {
      rows.push({
        action: 'cooked',
        actorId: member.userId,
        batchId: batchId++,
        createdAt: `${addDays(today, -ago)}T12:00:00Z`,
      });
    }
  });
  return { members, rows };
}
