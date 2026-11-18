// Pure helpers for the add-food sheet.

/** Splits a suggestion name around the typed text so the match can be bold. */
export function highlightParts(
  name: string,
  range: [start: number, end: number] | null,
): { before: string; match: string; after: string } {
  if (!range) return { before: name, match: '', after: '' };
  return { before: name.slice(0, range[0]), match: name.slice(range[0], range[1]), after: name.slice(range[1]) };
}

export function reviewTitle(count: number): string {
  return count === 1 ? 'Check it before adding' : `Check these ${count} items`;
}

export function addButtonLabel(count: number): string {
  return count === 1 ? 'Add to pantry' : `Add ${count} to pantry`;
}

export type AddFoodState = { text: string; seenSeed: number; cleared: boolean };

/**
 * What the sheet's text should be when it opens. A new seed (n changed) wins, then a finished
 * add starts fresh; otherwise what was typed is kept. `reset` says whether the review and
 * errors should be dropped too.
 */
export function stateOnOpen(
  state: AddFoodState,
  seed: { text: string; n: number },
): { next: AddFoodState; reset: boolean } {
  const newSeed = seed.n !== state.seenSeed;
  if (!newSeed && !state.cleared) return { next: state, reset: false };
  return { next: { text: newSeed ? seed.text : '', seenSeed: seed.n, cleared: false }, reset: true };
}
