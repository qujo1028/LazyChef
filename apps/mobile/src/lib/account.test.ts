import { describe, expect, it } from 'vitest';

import { APPLE_REMOVE_NOTE, avatarPhotoUrl, deleteOutcome, goalLine, initials, validateDisplayName } from './account';

describe('validateDisplayName', () => {
  it('trims and accepts 1 to 60 characters', () => {
    expect(validateDisplayName('  Quinn ')).toEqual({ ok: true, name: 'Quinn' });
    expect(validateDisplayName('a'.repeat(60)).ok).toBe(true);
  });
  it('rejects blank and too long', () => {
    expect(validateDisplayName('   ')).toEqual({ ok: false, error: "Your name can't be empty." });
    expect(validateDisplayName('a'.repeat(61))).toEqual({ ok: false, error: 'Keep it under 60 characters.' });
  });
});

describe('initials', () => {
  it('uses first and last word', () => {
    expect(initials('Quinn Johnson')).toBe('QJ');
    expect(initials('  ada  king  lovelace ')).toBe('AL');
  });
  it('handles one word, blank and missing', () => {
    expect(initials('quinn')).toBe('Q');
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
  it('does not split emoji', () => {
    expect(initials('🍳 Chef')).toBe('🍳C');
  });
});

describe('avatarPhotoUrl', () => {
  it('only passes https URLs', () => {
    expect(avatarPhotoUrl('https://lh3.googleusercontent.com/a/x')).toBe('https://lh3.googleusercontent.com/a/x');
    expect(avatarPhotoUrl('http://example.com/a.png')).toBeNull();
    expect(avatarPhotoUrl('javascript:alert(1)')).toBeNull();
    expect(avatarPhotoUrl('https://a b')).toBeNull();
    expect(avatarPhotoUrl(null)).toBeNull();
    expect(avatarPhotoUrl(`https://x.com/${'a'.repeat(2048)}`)).toBeNull();
  });
});

describe('deleteOutcome', () => {
  it('success without and with the Apple note', () => {
    expect(deleteOutcome({ ok: true, appleNotRevoked: false })).toEqual({
      kind: 'deleted',
      message: 'Your account is deleted.',
      appleNote: null,
    });
    expect(deleteOutcome({ ok: true, appleNotRevoked: true })).toMatchObject({ kind: 'deleted', appleNote: APPLE_REMOVE_NOTE });
  });
  it('shows the failure text', () => {
    expect(deleteOutcome({ ok: false, code: 'failed', error: 'Delete failed.' })).toEqual({ kind: 'error', message: 'Delete failed.' });
  });
  it('falls back for offline and not_configured with no text', () => {
    expect(deleteOutcome({ ok: false, code: 'offline', error: '' }).message).toMatch(/offline/i);
    expect(deleteOutcome({ ok: false, code: 'not_configured', error: '' }).message).toMatch(/Nothing was deleted/);
  });
  it('has no em dashes', () => {
    expect(APPLE_REMOVE_NOTE).not.toMatch(/—/);
  });
});

describe('goalLine', () => {
  it('pluralises', () => {
    expect(goalLine(1)).toBe('Cook 1 night a week');
    expect(goalLine(3)).toBe('Cook 3 nights a week');
  });
});
