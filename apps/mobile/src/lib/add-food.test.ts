import { describe, expect, it } from 'vitest';

import { addButtonLabel, highlightParts, reviewTitle, stateOnOpen } from './add-food';

describe('highlightParts', () => {
  it('splits around the match', () => {
    expect(highlightParts('chicken breast', [0, 3])).toEqual({ before: '', match: 'chi', after: 'cken breast' });
    expect(highlightParts('chicken breast', [8, 14])).toEqual({ before: 'chicken ', match: 'breast', after: '' });
  });
  it('returns the whole name without a match', () => {
    expect(highlightParts('milk', null)).toEqual({ before: 'milk', match: '', after: '' });
  });
});

describe('labels', () => {
  it('handles one and many', () => {
    expect(reviewTitle(1)).toBe('Check it before adding');
    expect(reviewTitle(3)).toBe('Check these 3 items');
    expect(addButtonLabel(1)).toBe('Add to pantry');
    expect(addButtonLabel(4)).toBe('Add 4 to pantry');
  });
});

describe('stateOnOpen', () => {
  const base = { text: 'eggs', seenSeed: 0, cleared: false };
  it('keeps text after an accidental close', () => {
    expect(stateOnOpen(base, { text: '', n: 0 })).toEqual({ next: base, reset: false });
  });
  it('starts with a new seed', () => {
    expect(stateOnOpen(base, { text: 'oat milk', n: 1 })).toEqual({
      next: { text: 'oat milk', seenSeed: 1, cleared: false },
      reset: true,
    });
  });
  it('starts fresh after a successful add', () => {
    expect(stateOnOpen({ ...base, cleared: true }, { text: 'old', n: 0 })).toEqual({
      next: { text: '', seenSeed: 0, cleared: false },
      reset: true,
    });
  });
});
