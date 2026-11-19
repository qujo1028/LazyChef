import type { HabitResult } from '@lazychef/core/habit/summary';
import { describe, expect, it } from 'vitest';

import { addedToListMessage, confirmLabel, doneTitle, habitLines, milestoneLine, tookOutLines, tookOutSummary } from './cook-done';

const habit = (over: Partial<HabitResult> = {}): HabitResult => ({
  cooksThisWeek: 3,
  tierBefore: null,
  tierAfter: null,
  streakBefore: 3,
  streakAfter: 4,
  milestone: null,
  ...over,
});

const row = (id: string, before: number | null, after: number | null) => ({
  item_id: id,
  name: 'milk',
  unit: 'cup',
  quantity_before: before,
  quantity_after: after,
});

describe('cook done text', () => {
  it('words the confirm button and title', () => {
    expect(confirmLabel(0)).toBe('Nothing to take out');
    expect(confirmLabel(1)).toBe('Take 1 item out');
    expect(confirmLabel(4)).toBe('Take 4 items out');
    expect(doneTitle('Tacos')).toBe('Nice! You cooked Tacos');
  });
  it('lists what came out', () => {
    const results = [row('a', 3, 2), row('b', 1, 0), row('c', null, null)];
    expect(tookOutSummary(results)).toBe('Took 2 items out of the pantry.');
    expect(tookOutLines(results)).toHaveLength(2);
    expect(tookOutSummary([])).toBe('Nothing came out of the pantry.');
  });
  it('shows the week and the streak', () => {
    expect(habitLines(habit())).toEqual(['3 of 3 this week', '4 day streak']);
    expect(habitLines(habit({ cooksThisWeek: 1, streakAfter: 1 }))).toEqual(['1 of 3 this week']);
    expect(habitLines(habit({ cooksThisWeek: 5 }))[0]).toBe('5 nights this week');
    expect(habitLines(null)).toEqual([]);
  });
  it('names the milestone', () => {
    expect(milestoneLine(habit())).toBeNull();
    expect(milestoneLine(habit({ milestone: { kind: 'tier', tier: 'silver' } }))).toBe('Silver this week!');
    expect(milestoneLine(habit({ milestone: { kind: 'streak', days: 7 } }))).toBe('7 day streak!');
    expect(milestoneLine(habit({ milestone: { kind: 'challenge', challenge: 'streak3' } }))).toBe('Challenge done: Cook 3 days in a row');
  });
  it('words the add to list toast', () => {
    expect(addedToListMessage(['milk'])).toMatch(/^Added .* to the shopping list$/);
    expect(addedToListMessage(['a', 'b'])).toBe('Added 2 items to the shopping list');
  });
});
