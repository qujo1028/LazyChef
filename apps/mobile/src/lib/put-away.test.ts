import { describe, expect, it } from 'vitest';

import { putAwayButtonLabel, putAwayTitle, putAwayToast, skippedCount } from './put-away';

describe('put away helpers', () => {
  it('titles and labels pluralize', () => {
    expect(putAwayTitle(0)).toBe('Put away');
    expect(putAwayTitle(1)).toBe('Put away 1 item');
    expect(putAwayTitle(3)).toBe('Put away 3 items');
    expect(putAwayButtonLabel(2, 4)).toBe('Put away 2 items');
    expect(putAwayButtonLabel(1, 1)).toBe('Put away 1 item');
    expect(putAwayButtonLabel(0, 4)).toBe('Clear 4 from the list');
  });
  it('counts skipped lines', () => {
    expect(skippedCount(5, 3)).toBe(2);
    expect(skippedCount(2, 3)).toBe(0);
  });
  it('builds the toast', () => {
    expect(putAwayToast(0, 2, '', 0)).toBe('Cleared 2 from the list');
    expect(putAwayToast(3, 3, 'Added 2 items, topped up 1', 0)).toBe('Put away 3 items. Added 2 items, topped up 1');
    expect(putAwayToast(1, 2, 'Added 1 item', 1)).toBe('Put away 1 item. Added 1 item. 1 cleared without adding');
  });
});
