import { describe, expect, it } from 'vitest';

import { addToListMessage } from './add-to-list-message';

const summary = { added: 0, toppedUp: 0, alreadyOnList: 0, ids: [] };

describe('addToListMessage', () => {
  it('says what was added, in lower case', () => {
    expect(addToListMessage('Eggs', { ...summary, added: 1, ids: ['a'] })).toEqual({
      message: 'Added eggs to the shopping list',
    });
  });

  it('lowercases the whole name and trims it', () => {
    expect(addToListMessage('  Greek YOGURT ', { ...summary, added: 1 }).message).toBe(
      'Added greek yogurt to the shopping list',
    );
  });

  it('says it is already on the list, with the name capitalised', () => {
    expect(addToListMessage('eggs', summary)).toEqual({ message: 'Eggs is already on the list' });
  });

  it('a top-up is not a new line, so it says it is already on the list', () => {
    expect(addToListMessage('milk', { ...summary, toppedUp: 1 }).message).toBe('Milk is already on the list');
  });

  it('shows an error as an error toast', () => {
    expect(addToListMessage('eggs', { error: 'Check your connection.' })).toEqual({
      message: 'Check your connection.',
      tone: 'error',
    });
  });
});
