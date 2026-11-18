import { describe, expect, it } from 'vitest';

import { MESSAGES } from './invite-code';
import { classifyPreview } from './invite-preview';

const row = { household_id: 'h1', household_name: 'The Johnsons', member_count: 2, is_member: false };

describe('classifyPreview', () => {
  it('finds a household', () => {
    expect(classifyPreview([row], null)).toEqual({
      kind: 'found',
      householdId: 'h1',
      name: 'The Johnsons',
      memberCount: 2,
      isMember: false,
    });
  });
  it('treats no rows as an invalid code', () => {
    expect(classifyPreview([], null)).toEqual({ kind: 'invalid' });
    expect(classifyPreview(null, null)).toEqual({ kind: 'invalid' });
  });
  it('maps the rate limit', () => {
    expect(classifyPreview(null, { code: 'LZ429', message: 'x' })).toEqual({ kind: 'limited', message: MESSAGES.limited });
  });
  it('maps other errors to a plain message', () => {
    expect(classifyPreview(null, { code: '', message: 'TypeError: Network request failed' })).toEqual({
      kind: 'error',
      message: MESSAGES.offline,
    });
  });
});
