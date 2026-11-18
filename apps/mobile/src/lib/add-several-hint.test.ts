import { describe, expect, it } from 'vitest';

import { addSeveralHint } from './add-several-hint';

describe('addSeveralHint', () => {
  it('explains the format when empty', () => {
    expect(addSeveralHint(0)).toBe('One item per line, or separate with commas.');
  });
  it('counts items', () => {
    expect(addSeveralHint(1)).toBe('1 item. Amounts are optional.');
    expect(addSeveralHint(3)).toBe('3 items. Amounts are optional.');
  });
});
