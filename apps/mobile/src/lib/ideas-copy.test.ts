import type { AiAllowance, AiFailure } from '@lazychef/core/ai/edge-contract';
import { describe, expect, it } from 'vitest';

import { consentKey, countLine, defaultIdeaMeal, IDEA_MEAL_CHOICES, limitReached, mealPhrase, MEAL_IDEAS_SENDS, problemFor } from './ideas-copy';

const free = (used: number): AiAllowance => ({ pro: false, used, limit: 10, resetsAt: null });

describe('ideas copy', () => {
  it('labels every meal and puts Any last', () => {
    expect(IDEA_MEAL_CHOICES.map((c) => c.label)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Sides', 'Salad', 'Soup', 'Snack', 'Dessert', 'Any']);
  });

  it('defaults the meal by the hour', () => {
    expect(defaultIdeaMeal(8)).toBe('breakfast');
    expect(defaultIdeaMeal(12)).toBe('lunch');
    expect(defaultIdeaMeal(18)).toBe('main course');
    expect(defaultIdeaMeal(23)).toBe('dessert');
    expect(defaultIdeaMeal(null)).toBe('any');
  });

  it('words the meal', () => {
    expect(mealPhrase('main course')).toBe('dinner');
    expect(mealPhrase('any')).toBe('a meal');
    expect(mealPhrase('soup')).toBe('soup');
  });

  it('words the count line', () => {
    expect(countLine(free(3))).toBe('7 of 10 free ideas left this week');
    expect(countLine(free(9))).toBe('1 of 10 free idea left this week');
    expect(countLine(free(10))).toBe('No free ideas left this week');
    expect(countLine({ pro: true, used: 0, limit: 10, resetsAt: null })).toBeNull();
    expect(countLine(null)).toBeNull();
  });

  it('knows when the limit is reached', () => {
    expect(limitReached(free(9))).toBe(false);
    expect(limitReached(free(10))).toBe(true);
    expect(limitReached({ pro: true, used: 0, limit: 10, resetsAt: null })).toBe(false);
    expect(limitReached(undefined)).toBe(false);
  });

  it('maps failures to screens', () => {
    const f = (code: AiFailure['code'], extra: Partial<AiFailure> = {}): AiFailure => ({ error: 'x', code, ...extra });
    expect(problemFor(f('not_configured'), false)).toMatchObject({ kind: 'not_set_up', message: "AI ideas aren't set up yet.", retry: false });
    expect(problemFor(f('upstream'), true).kind).toBe('offline');
    expect(problemFor(f('rate_limited'), false).kind).toBe('rate_limited');
    expect(problemFor(f('empty_pantry'), false).kind).toBe('empty_pantry');
    expect(problemFor(f('upstream', { error: 'Try later.' }), false)).toMatchObject({ kind: 'upstream', message: 'Try later.', retry: true });
    expect(problemFor(f('unauthorized'), false)).toMatchObject({ kind: 'upstream', retry: true });
  });

  it('says when more free ideas come back', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    const problem = problemFor({ error: 'x', code: 'limit_reached', allowance: { ...free(10), resetsAt: '2026-11-18T20:00:00Z' } }, false, now);
    expect(problem.kind).toBe('limit');
    expect(problem.message).toContain('More come back later today');
  });

  it('keys consent to the wording', () => {
    expect(consentKey(MEAL_IDEAS_SENDS)).toContain(MEAL_IDEAS_SENDS);
    expect(consentKey('a')).not.toBe(consentKey('b'));
  });

  it('uses no em dashes', () => {
    expect(JSON.stringify(IDEA_MEAL_CHOICES) + problemFor({ error: '', code: 'upstream' }, false).message).not.toContain('—');
  });
});
