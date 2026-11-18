import { describe, expect, it } from 'vitest';

import {
  cleanInviteCode,
  firstName,
  formatCodeInput,
  householdErrorMessage,
  isNetworkError,
  memberCountLine,
  MESSAGES,
} from './invite-code';

describe('cleanInviteCode', () => {
  it('normalizes like the database', () => {
    expect(cleanInviteCode('k7qx - m2pa')).toBe('K7QXM2PA');
    expect(cleanInviteCode('K7QX-M2PA')).toBe('K7QXM2PA');
  });
  it('rejects the wrong length', () => {
    expect(cleanInviteCode('K7QX')).toBeNull();
    expect(cleanInviteCode('K7QXM2PAX')).toBeNull();
    expect(cleanInviteCode('')).toBeNull();
    expect(cleanInviteCode(undefined)).toBeNull();
  });
});

describe('formatCodeInput', () => {
  it('adds the dash after four and caps at eight', () => {
    expect(formatCodeInput('k7q')).toBe('K7Q');
    expect(formatCodeInput('k7qx')).toBe('K7QX');
    expect(formatCodeInput('k7qxm')).toBe('K7QX-M');
    expect(formatCodeInput('k7qx-m2pa99')).toBe('K7QX-M2PA');
  });
});

describe('householdErrorMessage', () => {
  it('maps the rate limit', () => {
    expect(householdErrorMessage({ code: 'LZ429', message: 'Too many tries.' })).toBe(MESSAGES.limited);
  });
  it('maps network failures', () => {
    expect(householdErrorMessage({ code: '', message: 'TypeError: Network request failed' })).toBe(MESSAGES.offline);
    expect(householdErrorMessage({ name: 'TypeError', message: 'Failed to fetch' })).toBe(MESSAGES.offline);
  });
  it('keeps our own validation messages', () => {
    expect(householdErrorMessage({ code: '22023', message: 'Household names need 1 to 60 characters.' })).toBe(
      'Household names need 1 to 60 characters.',
    );
  });
  it('hides other database errors', () => {
    expect(householdErrorMessage({ code: '42501', message: 'permission denied for table x' })).toBe(MESSAGES.generic);
    expect(householdErrorMessage(null)).toBe(MESSAGES.generic);
  });
  it('does not call a database error a network error', () => {
    expect(isNetworkError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
  });
});

describe('memberCountLine', () => {
  it('handles one and many', () => {
    expect(memberCountLine(1)).toBe('1 person is already sharing a pantry there.');
    expect(memberCountLine(3)).toBe('3 people are already sharing a pantry there.');
    expect(memberCountLine(1, 'shares')).toBe('1 person shares this pantry and shopping list.');
    expect(memberCountLine(2, 'shares')).toBe('2 people share this pantry and shopping list.');
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Quinn Johnson')).toBe('Quinn');
    expect(firstName('  Ana  ')).toBe('Ana');
    expect(firstName('   ')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
