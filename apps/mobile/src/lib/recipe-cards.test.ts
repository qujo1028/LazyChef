import { describe, expect, it } from 'vitest';

import { haveLine, missingLine, readyLabel, savedSummary } from './recipe-cards';

describe('readyLabel', () => {
  it('formats minutes and hours', () => {
    expect(readyLabel(25)).toBe('25 min');
    expect(readyLabel(60)).toBe('1 h');
    expect(readyLabel(75)).toBe('1 h 15 min');
    expect(readyLabel(null)).toBeNull();
    expect(readyLabel(0)).toBeNull();
  });
});

describe('missingLine', () => {
  it('lists what is missing, shortened', () => {
    expect(missingLine([])).toBe('You have everything');
    expect(missingLine(['eggs', 'milk'])).toBe('Missing: Eggs, Milk');
    expect(missingLine(['a', 'b', 'c', 'd', 'e'])).toContain('and 2 more');
  });
});

describe('haveLine', () => {
  it('says can make now or have N of M', () => {
    expect(haveLine({ have: 3, need: [] })).toBe('Can make now');
    expect(haveLine({ have: 5, need: ['a', 'b'] })).toBe('Have 5 of 7');
    expect(haveLine(null)).toBeNull();
  });
});

describe('savedSummary', () => {
  it('counts what can be made now', () => {
    const base = { source: 'user' as const, title: 't', image: null, readyInMinutes: null, savedAt: '', savedBy: null, history: null };
    expect(savedSummary([])).toBe("Your household's favorites.");
    expect(savedSummary([{ ...base, id: '1', match: { have: 1, need: [] } }, { ...base, id: '2', match: null }])).toBe(
      '2 saved · 1 you can make now',
    );
  });
});
