import { summarize } from '@lazychef/core/habit/summary';
import { describe, expect, it } from 'vitest';

import {
  applyDevPreset,
  nextTierHint,
  parseDismissed,
  ringFill,
  ringLabel,
  serializeDismissed,
  streakLine,
  tierLine,
  weekHeadline,
} from './week-card';

// Wednesday 2026-11-18.
const NOW = Date.parse('2026-11-18T12:00:00Z');
const base = summarize([], NOW, 'UTC');

describe('week card text', () => {
  it('labels the ring', () => {
    expect(ringLabel(2, 3)).toBe('2 of 3 cook days this week');
  });
  it('caps the fill', () => {
    expect(ringFill(5, 3)).toBe(1);
    expect(ringFill(1, 4)).toBe(0.25);
    expect(ringFill(0, 0)).toBe(0);
  });
  it('words the streak', () => {
    expect(streakLine({ streak: { count: 4, forgave: false, atRisk: false }, comeback: false })).toBe('4 day streak');
    expect(streakLine({ streak: { count: 4, forgave: false, atRisk: true }, comeback: false })).toContain('cook today');
    expect(streakLine({ streak: { count: 0, forgave: false, atRisk: false }, comeback: false })).toBeNull();
    expect(streakLine({ streak: { count: 4, forgave: false, atRisk: false }, comeback: true })).toBeNull();
  });
  it('words the tier and the next one', () => {
    expect(tierLine(1)).toBeNull();
    expect(tierLine(4)).toBe('Silver this week');
    expect(nextTierHint(3)).toBe('1 more night for Silver');
    expect(nextTierHint(6)).toBeNull();
  });
  it('picks a headline', () => {
    expect(weekHeadline({ cooksThisWeek: 0, comeback: false }, 3, true).headline).toBe('Start your week');
    expect(weekHeadline({ cooksThisWeek: 0, comeback: true }, 3, false).headline).toBe('Welcome back');
    expect(weekHeadline({ cooksThisWeek: 3, comeback: false }, 3, false).headline).toBe('Goal reached');
    expect(weekHeadline({ cooksThisWeek: 1, comeback: false }, 3, false).sub).toBe('2 more nights to hit your goal.');
  });
});

describe('dismissals', () => {
  it('round trips for the same day only', () => {
    const raw = serializeDismissed('2026-11-18', new Set(['a']));
    expect([...parseDismissed(raw, '2026-11-18')]).toEqual(['a']);
    expect(parseDismissed(raw, '2026-11-19').size).toBe(0);
    expect(parseDismissed('nope', '2026-11-18').size).toBe(0);
    expect(parseDismissed(null, '2026-11-18').size).toBe(0);
  });
});

describe('dev presets', () => {
  it('simulates cook days', () => {
    const s = applyDevPreset(base, { kind: 'cookDays', n: 4 });
    expect(s.cooksThisWeek).toBe(4);
    expect(s.days.size).toBe(4);
    expect(s.tier).toBe('silver');
  });
  it('simulates a streak without changing the base', () => {
    const s = applyDevPreset(base, { kind: 'streak', n: 4 });
    expect(s.streak.count).toBe(4);
    expect(base.streak.count).toBe(0);
  });
  it('simulates a comeback', () => {
    const s = applyDevPreset(base, { kind: 'comeback' });
    expect(s.comeback).toBe(true);
    expect(s.cooksThisWeek).toBe(0);
  });
  it('simulates a finished challenge', () => {
    expect(applyDevPreset(base, { kind: 'challengeDone' }).challenge).toBeNull();
  });
});
