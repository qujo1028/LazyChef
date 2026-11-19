import { describe, expect, it } from 'vitest';

import { buildHeatmap } from '@lazychef/core/habit/heatmap';
import { computeLeaderboard } from '@lazychef/core/habit/leaderboard';

import {
  actionLook,
  barPercent,
  boardDays,
  boardRowLabel,
  buildLogRows,
  cellLabel,
  devBoardData,
  entryLabel,
  heatmapCookDays,
  heatmapIsEmpty,
  heatmapSummary,
  initialsOf,
  toActivityRow,
  type DevBoardPreset,
  type RawActivityRow,
} from './activity-screen';

const NOW = Date.parse('2026-11-18T15:00:00Z'); // a Wednesday
const VIEWER = { userId: 'me', displayName: 'Me', avatarUrl: null };

const raw = (over: Partial<RawActivityRow> = {}): RawActivityRow => ({
  id: '5',
  actor_id: 'me',
  action: 'added',
  item_name: 'Eggs',
  quantity: '12',
  unit: 'count',
  batch_id: '9',
  details: null,
  created_at: '2026-11-18T14:00:00Z',
  actor: { display_name: 'Me', avatar_url: null },
  ...over,
});

describe('toActivityRow', () => {
  it('maps the joined row and turns numeric strings into numbers', () => {
    const row = toActivityRow(raw());
    expect(row).toMatchObject({ id: 5, batchId: 9, quantity: 12, actor: { name: 'Me', avatarUrl: null } });
  });
  it('keeps a null actor and a null quantity', () => {
    const row = toActivityRow(raw({ actor: null, quantity: null, actor_id: null }));
    expect(row.actor).toBeNull();
    expect(row.quantity).toBeNull();
    expect(row.actorId).toBeNull();
  });
});

describe('buildLogRows', () => {
  it('is empty with no rows', () => {
    expect(buildLogRows([], NOW, 'UTC')).toEqual([]);
  });
  it('puts a day heading before each day and groups a batch into one entry', () => {
    const rows = [
      toActivityRow(raw({ id: 3, created_at: '2026-11-18T14:00:00Z' })),
      toActivityRow(raw({ id: 2, created_at: '2026-11-18T14:00:00Z' })),
      toActivityRow(raw({ id: 1, batch_id: 4, created_at: '2026-11-17T10:00:00Z' })),
    ];
    const out = buildLogRows(rows, NOW, 'UTC');
    expect(out.map((r) => r.kind)).toEqual(['day', 'entry', 'day', 'entry']);
    expect(out[0]).toMatchObject({ label: 'Today' });
    expect(out[2]).toMatchObject({ label: 'Yesterday' });
  });
  it('uses the given time zone to place the day', () => {
    // 03:00 UTC on the 18th is still the 17th in Los Angeles.
    const rows = [toActivityRow(raw({ created_at: '2026-11-18T03:00:00Z' }))];
    expect(buildLogRows(rows, NOW, 'America/Los_Angeles')[0]).toMatchObject({ label: 'Yesterday' });
    expect(buildLogRows(rows, NOW, 'UTC')[0]).toMatchObject({ label: 'Today' });
  });
});

describe('actionLook and entryLabel', () => {
  it('styles cooking with the accent and gives every action an icon', () => {
    expect(actionLook('cooked').tone).toBe('accent');
    for (const a of ['added', 'restocked', 'used', 'updated', 'removed', 'cooked', 'shopped'] as const) {
      expect(actionLook(a).icon).not.toBe('');
    }
  });
  it('reads an entry aloud with its time first', () => {
    expect(entryLabel('2h ago', 'You', 'cooked', 'Soup', null)).toBe('2h ago. You cooked Soup');
    expect(entryLabel('2h ago', 'Sam', 'updated', 'Rice', 'Renamed from “white rice”')).toBe(
      '2h ago. Sam updated Rice. Renamed from “white rice”',
    );
  });
});

describe('heatmap helpers', () => {
  const rowsAgo = (days: number[]) =>
    days.map((ago, i) => ({
      action: 'cooked',
      actorId: 'me',
      batchId: i + 1,
      createdAt: new Date(NOW - ago * 86_400_000).toISOString(),
    }));

  it('describes an empty calendar', () => {
    const map = buildHeatmap([], NOW, 'UTC');
    expect(heatmapIsEmpty(map)).toBe(true);
    expect(heatmapSummary(map)).toContain('No cooks yet.');
  });
  it('summarizes the grid in one label', () => {
    const map = buildHeatmap(rowsAgo([0, 1, 1, 20]), NOW, 'UTC');
    expect(heatmapCookDays(map)).toBe(3);
    const summary = heatmapSummary(map);
    expect(summary).toContain('last 16 weeks');
    expect(summary).toContain('Cooked on 3 of the last 28 days.');
    expect(summary).toContain('3 cook days in all.');
    expect(summary).toContain('Busiest day Tue, Nov 17 with 2 meals.');
  });
  it('labels cells by state', () => {
    expect(cellLabel({ day: '2026-11-18', cooks: 0, level: 0, future: false })).toBe('Wed, Nov 18: no cook');
    expect(cellLabel({ day: '2026-11-18', cooks: 1, level: 1, future: false })).toBe('Wed, Nov 18: 1 meal cooked');
    expect(cellLabel({ day: '2026-11-18', cooks: 3, level: 3, future: false })).toBe('Wed, Nov 18: 3 meals cooked');
    expect(cellLabel({ day: '2026-11-19', cooks: 0, level: 0, future: true })).toBe('Thu, Nov 19: upcoming');
  });
});

describe('board helpers', () => {
  it('pluralizes days', () => {
    expect(boardDays(1)).toBe('1 day');
    expect(boardDays(0)).toBe('0 days');
    expect(boardDays(5, true)).toBe('5+ days');
  });
  it('sizes bars against the leader with a sliver above zero', () => {
    expect(barPercent(0, 5)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
    expect(barPercent(5, 5)).toBe(100);
    expect(barPercent(1, 100)).toBe(6);
  });
  it('makes initials', () => {
    expect(initialsOf('Alex Kim')).toBe('AK');
    expect(initialsOf('alex')).toBe('A');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
  });
  it('speaks a board row', () => {
    expect(boardRowLabel(1, 'Alex', true, 3, true, false)).toBe('1. Alex, you, 3 days, won last week');
    expect(boardRowLabel(2, 'Sam', false, 1, false, false)).toBe('2. Sam, 1 day');
  });
});

describe('dev board presets', () => {
  const presets: DevBoardPreset[] = ['nobody', 'quiet', 'busy', 'tie', 'solo'];

  it('always includes the viewer', () => {
    for (const p of presets) expect(devBoardData(p, VIEWER, NOW, 'UTC').members[0]).toEqual(VIEWER);
  });
  it('nobody has no cooks and solo has one member', () => {
    expect(devBoardData('nobody', VIEWER, NOW, 'UTC').rows).toHaveLength(0);
    expect(devBoardData('solo', VIEWER, NOW, 'UTC').members).toHaveLength(1);
  });
  it('tie ranks the first two the same this week', () => {
    const { members, rows } = devBoardData('tie', VIEWER, NOW, 'UTC');
    const board = computeLeaderboard(rows, members, NOW, 'UTC');
    expect(board.weekly[0].week).toBe(board.weekly[1].week);
    expect(board.weekly[0].weekRank).toBe(1);
    expect(board.weekly[1].weekRank).toBe(1);
  });
  it('busy gives a different count to each person and fills the calendar', () => {
    const { members, rows } = devBoardData('busy', VIEWER, NOW, 'UTC');
    const board = computeLeaderboard(rows, members, NOW, 'UTC');
    expect(new Set(board.allTime.map((e) => e.allTime)).size).toBe(members.length);
    expect(heatmapCookDays(buildHeatmap(rows, NOW, 'UTC'))).toBeGreaterThan(10);
  });
});
