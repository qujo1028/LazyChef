import { describe, expect, it } from 'vitest';

import { parsePendingInvite, PENDING_INVITE_MAX_AGE_MS, serializePendingInvite } from './pending-invite';

const NOW = 1_800_000_000_000;

describe('pending invite', () => {
  it('round-trips a normalized code', () => {
    const stored = serializePendingInvite('k7qx-m2pa', NOW);
    expect(stored).not.toBeNull();
    expect(parsePendingInvite(stored, NOW + 1000)).toBe('K7QXM2PA');
  });

  it('refuses to store something that is not a code', () => {
    expect(serializePendingInvite('nope', NOW)).toBeNull();
    expect(serializePendingInvite('', NOW)).toBeNull();
  });

  it('expires after 7 days', () => {
    const stored = serializePendingInvite('K7QXM2PA', NOW);
    expect(parsePendingInvite(stored, NOW + PENDING_INVITE_MAX_AGE_MS)).toBe('K7QXM2PA');
    expect(parsePendingInvite(stored, NOW + PENDING_INVITE_MAX_AGE_MS + 1)).toBeNull();
  });

  it('ignores missing or broken values', () => {
    expect(parsePendingInvite(null, NOW)).toBeNull();
    expect(parsePendingInvite('', NOW)).toBeNull();
    expect(parsePendingInvite('{oops', NOW)).toBeNull();
    expect(parsePendingInvite('"K7QXM2PA"', NOW)).toBeNull();
    expect(parsePendingInvite(JSON.stringify({ code: 'K7QXM2PA' }), NOW)).toBeNull();
    expect(parsePendingInvite(JSON.stringify({ code: 'SHORT', savedAt: NOW }), NOW)).toBeNull();
    expect(parsePendingInvite(JSON.stringify({ code: 42, savedAt: NOW }), NOW)).toBeNull();
  });
});
