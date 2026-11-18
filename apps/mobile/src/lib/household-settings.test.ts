import { describe, expect, it } from 'vitest';

import {
  buildInviteLink,
  DEFAULT_WEB_URL,
  formatJoined,
  friendlyError,
  inviteShareContent,
  leaveCopy,
  spellInviteCode,
  toMembers,
  validateHouseholdName,
} from './household-settings';

describe('validateHouseholdName', () => {
  it('trims and accepts 1 to 60 characters', () => {
    expect(validateHouseholdName('  Maple St  ')).toEqual({ ok: true, name: 'Maple St' });
    expect(validateHouseholdName('a'.repeat(60))).toEqual({ ok: true, name: 'a'.repeat(60) });
  });

  it('uses the web app copy for empty and long names', () => {
    expect(validateHouseholdName('   ')).toEqual({ ok: false, error: 'Give your household a name.' });
    expect(validateHouseholdName('a'.repeat(61))).toEqual({ ok: false, error: 'Keep it under 60 characters.' });
  });
});

describe('buildInviteLink', () => {
  it('builds the web join link', () => {
    expect(buildInviteLink('https://example.app', 'K7QXM2PA')).toBe('https://example.app/join/K7QXM2PA');
  });

  it('drops trailing slashes and falls back to the live site', () => {
    expect(buildInviteLink('https://example.app//', 'K7QXM2PA')).toBe('https://example.app/join/K7QXM2PA');
    expect(buildInviteLink(undefined, 'K7QXM2PA')).toBe(`${DEFAULT_WEB_URL}/join/K7QXM2PA`);
    expect(buildInviteLink('  ', 'K7QXM2PA')).toBe(`${DEFAULT_WEB_URL}/join/K7QXM2PA`);
  });
});

describe('inviteShareContent', () => {
  const link = 'https://example.app/join/K7QXM2PA';

  it('passes the link as its own item on iOS', () => {
    const content = inviteShareContent('ios', 'Maple St', link);
    expect(content.url).toBe(link);
    expect(content.message).toContain('"Maple St"');
    expect(content.message).not.toContain(link);
  });

  it('puts the link in the message elsewhere', () => {
    const content = inviteShareContent('android', 'Maple St', link);
    expect(content).not.toHaveProperty('url');
    expect(content.message.endsWith(link)).toBe(true);
  });
});

describe('spellInviteCode', () => {
  it('spaces out each character', () => {
    expect(spellInviteCode('K7QX-M2PA')).toBe('K 7 Q X, M 2 P A');
  });
});

describe('formatJoined', () => {
  const now = new Date(2026, 10, 18, 9, 0);

  it('says today and yesterday', () => {
    expect(formatJoined(new Date(2026, 10, 18, 1, 0).toISOString(), now)).toBe('Joined today');
    expect(formatJoined(new Date(2026, 10, 17, 23, 0).toISOString(), now)).toBe('Joined yesterday');
  });

  it('shows a date otherwise', () => {
    expect(formatJoined(new Date(2026, 2, 4, 12, 0).toISOString(), now)).toBe('Joined Mar 4, 2026');
  });

  it('copes with a bad date', () => {
    expect(formatJoined('not a date', now)).toBe('Joined');
  });
});

describe('toMembers', () => {
  it('maps rows and falls back to Housemate', () => {
    expect(
      toMembers([
        { user_id: 'a', role: 'owner', joined_at: '2026-01-01', profile: { display_name: 'Sam', avatar_url: null } },
        { user_id: 'b', role: 'member', joined_at: '2026-01-02', profile: null },
        { user_id: 'c', role: 'member', joined_at: '2026-01-03', profile: { display_name: '  ', avatar_url: 'x' } },
      ]),
    ).toEqual([
      { userId: 'a', role: 'owner', joinedAt: '2026-01-01', displayName: 'Sam', avatarUrl: null },
      { userId: 'b', role: 'member', joinedAt: '2026-01-02', displayName: 'Housemate', avatarUrl: null },
      { userId: 'c', role: 'member', joinedAt: '2026-01-03', displayName: 'Housemate', avatarUrl: 'x' },
    ]);
  });
});

describe('friendlyError', () => {
  it('keeps database messages', () => {
    expect(friendlyError({ message: 'Only the household owner can remove people.' })).toBe(
      'Only the household owner can remove people.',
    );
  });

  it('rewrites network failures', () => {
    expect(friendlyError(new TypeError('Network request failed'))).toMatch(/Check your connection/);
    expect(friendlyError({ message: 'TypeError: Failed to fetch' })).toMatch(/Check your connection/);
  });

  it('has a fallback', () => {
    expect(friendlyError(null)).toBe('Something went wrong. Please try again.');
  });
});

describe('leaveCopy', () => {
  it('warns the last member that the household is deleted', () => {
    const copy = leaveCopy({ householdName: 'Maple St', memberCount: 1, isOwner: true });
    expect(copy.title).toBe('Leave Maple St?');
    expect(copy.confirm).toBe('Leave and delete');
  });

  it('mentions the hand-over only for owners', () => {
    expect(leaveCopy({ householdName: 'H', memberCount: 3, isOwner: true }).message).toMatch(/becomes the owner/);
    expect(leaveCopy({ householdName: 'H', memberCount: 3, isOwner: false }).message).not.toMatch(/owner/);
  });
});
