import { describe, expect, it } from 'vitest';

import { quotaNotice, resetTimeLabel, searchesLeft } from './recipe-quota';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m).toISOString();

describe('searchesLeft', () => {
  it('rounds down and never goes below zero', () => {
    expect(searchesLeft(14)).toBe(10);
    expect(searchesLeft(1)).toBe(0);
    expect(searchesLeft(-3)).toBe(0);
  });
});

describe('resetTimeLabel', () => {
  it('reads like a person would say it', () => {
    expect(resetTimeLabel(at(17))).toBe('5 pm');
    expect(resetTimeLabel(at(9, 30))).toBe('9:30 am');
    expect(resetTimeLabel(at(0))).toBe('midnight');
    expect(resetTimeLabel(at(12))).toBe('12 pm');
    expect(resetTimeLabel('nope')).toBeNull();
  });
});

describe('quotaNotice', () => {
  const quota = { pointsLeft: 14, resetsAt: at(17), resting: false };
  it('counts searches left', () => {
    expect(quotaNotice({ offline: false, quota, failure: null })).toEqual({
      tone: 'info',
      text: 'Spoonacular: 10 searches left today, resets at 5 pm',
    });
    expect(quotaNotice({ offline: false, quota: { ...quota, pointsLeft: 1.5 }, failure: null })?.text).toContain('1 search left');
  });
  it('says plainly when new ideas rest', () => {
    expect(quotaNotice({ offline: false, quota: { ...quota, resting: true }, failure: null })?.text).toBe(
      'New ideas are resting until 5 pm. Showing recipes from your library.',
    );
    expect(quotaNotice({ offline: false, quota: null, failure: { code: 'resting' } })?.text).toContain('resting for now');
  });
  it('covers offline, not configured and other failures', () => {
    expect(quotaNotice({ offline: true, quota, failure: null })?.text).toContain('offline');
    expect(quotaNotice({ offline: false, quota: null, failure: { code: 'not_configured' } })?.text).toContain("aren't set up");
    expect(quotaNotice({ offline: false, quota: null, failure: { code: 'upstream' } })?.tone).toBe('note');
  });
  it('is quiet when the quota is unknown', () => {
    expect(quotaNotice({ offline: false, quota: { ...quota, pointsLeft: null }, failure: null })).toBeNull();
  });
});
