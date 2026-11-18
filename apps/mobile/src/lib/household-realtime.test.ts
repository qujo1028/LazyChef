import { describe, expect, it } from 'vitest';

import {
  BACKOFF_MAX_MS,
  backoffDelay,
  channelStatus,
  householdTopic,
  isChannelFailure,
  isOnline,
  parseBroadcast,
} from './household-realtime';

describe('householdTopic', () => {
  it('matches the topic the database broadcasts to', () => {
    expect(householdTopic('abc')).toBe('household:abc');
  });
});

describe('parseBroadcast', () => {
  it('refreshes for households and household_members', () => {
    expect(parseBroadcast({ table: 'households', operation: 'UPDATE', record: {}, old_record: {} })).toEqual({
      kind: 'refresh',
    });
    expect(parseBroadcast({ table: 'household_members', operation: 'DELETE', old_record: {} })).toEqual({
      kind: 'refresh',
    });
  });

  it('maps other tables to a change with old_record renamed', () => {
    const record = { id: '1', name: 'Milk' };
    const old = { id: '1', name: 'Mlk' };
    expect(
      parseBroadcast({ table: 'pantry_items', schema: 'public', operation: 'UPDATE', record, old_record: old }),
    ).toEqual({ kind: 'change', table: 'pantry_items', change: { operation: 'UPDATE', record, oldRecord: old } });
  });

  it('fills missing records with null', () => {
    expect(parseBroadcast({ table: 'shopping_list_items', operation: 'INSERT', record: { id: '2' } })).toEqual({
      kind: 'change',
      table: 'shopping_list_items',
      change: { operation: 'INSERT', record: { id: '2' }, oldRecord: null },
    });
  });

  it('ignores payloads it does not recognise', () => {
    expect(parseBroadcast(undefined)).toBeNull();
    expect(parseBroadcast(null)).toBeNull();
    expect(parseBroadcast('x')).toBeNull();
    expect(parseBroadcast({})).toBeNull();
    expect(parseBroadcast({ table: '' })).toBeNull();
    expect(parseBroadcast({ table: 'pantry_items' })).toBeNull();
    expect(parseBroadcast({ table: 'pantry_items', operation: 'TRUNCATE' })).toBeNull();
  });
});

describe('backoffDelay', () => {
  const noJitter = () => 1;

  it('doubles from one second', () => {
    expect([0, 1, 2, 3, 4].map((a) => backoffDelay(a, noJitter))).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('caps at the maximum, even for huge attempts', () => {
    expect(backoffDelay(5, noJitter)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(1000, noJitter)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(Number.POSITIVE_INFINITY, noJitter)).toBe(1000);
  });

  it('treats bad attempts as the first', () => {
    expect(backoffDelay(-3, noJitter)).toBe(1000);
    expect(backoffDelay(Number.NaN, noJitter)).toBe(1000);
  });

  it('jitters within the upper half', () => {
    expect(backoffDelay(2, () => 0)).toBe(2000);
    expect(backoffDelay(2, () => 0.5)).toBe(3000);
    expect(backoffDelay(10, () => 0)).toBe(BACKOFF_MAX_MS / 2);
    expect(backoffDelay(2, () => 7)).toBe(4000);
  });
});

describe('isChannelFailure', () => {
  it('flags error, timeout and close', () => {
    expect(isChannelFailure('CHANNEL_ERROR')).toBe(true);
    expect(isChannelFailure('TIMED_OUT')).toBe(true);
    expect(isChannelFailure('CLOSED')).toBe(true);
    expect(isChannelFailure('SUBSCRIBED')).toBe(false);
  });
});

describe('channelStatus', () => {
  it('is offline without network or in the background', () => {
    expect(channelStatus({ online: false, foreground: true, subscribed: true })).toBe('offline');
    expect(channelStatus({ online: true, foreground: false, subscribed: false })).toBe('offline');
  });

  it('is live once subscribed, connecting before', () => {
    expect(channelStatus({ online: true, foreground: true, subscribed: true })).toBe('live');
    expect(channelStatus({ online: true, foreground: true, subscribed: false })).toBe('connecting');
  });
});

describe('isOnline', () => {
  it('treats unknown as online', () => {
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: true })).toBe(true);
    expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});
