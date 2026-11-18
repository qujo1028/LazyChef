import { describe, expect, it } from 'vitest';

import { rewardPlan } from './reward-plan';

describe('rewardPlan', () => {
  it('plays the full timeline with motion', () => {
    const beats = rewardPlan('milestone', false);
    expect(beats.some((b) => b.visual === 'confetti')).toBe(true);
    expect(beats.filter((b) => b.haptic).length).toBeGreaterThan(1);
  });
  it('keeps one haptic and no confetti under reduce motion', () => {
    for (const kind of ['cook', 'milestone'] as const) {
      const beats = rewardPlan(kind, true);
      expect(beats.filter((b) => b.haptic)).toHaveLength(1);
      expect(beats.some((b) => b.visual === 'confetti')).toBe(false);
    }
  });
  it('lands inside a second', () => {
    for (const reduce of [false, true]) {
      expect(Math.max(...rewardPlan('cook', reduce).map((b) => b.at))).toBeLessThan(1000);
    }
  });
});
