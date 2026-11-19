import { describe, expect, it } from 'vitest';

import {
  canUsePush,
  createTapGuard,
  devNotification,
  permissionState,
  pushStatus,
  registrationArgs,
  resolveProjectId,
  tapRouteFor,
  toastMessage,
} from './push-state';

describe('permissionState', () => {
  it('maps the three states', () => {
    expect(permissionState({ granted: true, canAskAgain: true })).toBe('granted');
    expect(permissionState({ granted: false, canAskAgain: true })).toBe('undetermined');
    expect(permissionState({ granted: false, canAskAgain: false })).toBe('denied');
  });
});

describe('pushStatus', () => {
  it('checks the device first, then the project, then permission', () => {
    expect(pushStatus({ capable: false, projectId: null, permission: 'denied' })).toBe('unsupported');
    expect(pushStatus({ capable: true, projectId: null, permission: 'granted' })).toBe('no_project');
    expect(pushStatus({ capable: true, projectId: 'abc', permission: 'denied' })).toBe('denied');
    expect(pushStatus({ capable: true, projectId: 'abc', permission: 'undetermined' })).toBe('ready');
  });
});

describe('canUsePush', () => {
  it('needs a real phone', () => {
    expect(canUsePush({ os: 'ios', isDevice: true })).toBe(true);
    expect(canUsePush({ os: 'ios', isDevice: false })).toBe(false);
    expect(canUsePush({ os: 'web', isDevice: true })).toBe(false);
  });
});

describe('resolveProjectId', () => {
  it('prefers app config, falls back to eas config, else null', () => {
    expect(resolveProjectId({ expoConfig: { extra: { eas: { projectId: ' p1 ' } } }, easConfig: { projectId: 'p2' } })).toBe('p1');
    expect(resolveProjectId({ expoConfig: { extra: {} }, easConfig: { projectId: 'p2' } })).toBe('p2');
    expect(resolveProjectId({ expoConfig: null, easConfig: null })).toBeNull();
    expect(resolveProjectId({ expoConfig: { extra: { eas: { projectId: '' } } } })).toBeNull();
  });
});

describe('registrationArgs', () => {
  it('builds the rpc arguments', () => {
    expect(registrationArgs({ token: 'ExponentPushToken[x]', os: 'ios', timeZone: 'America/Denver', appVersion: '1.0.0' })).toEqual({
      p_token: 'ExponentPushToken[x]',
      p_platform: 'ios',
      p_timezone: 'America/Denver',
      p_app_version: '1.0.0',
    });
  });
  it('sends a missing version as null and rejects bad input', () => {
    expect(registrationArgs({ token: 't', os: 'android', timeZone: 'UTC', appVersion: undefined })?.p_app_version).toBeNull();
    expect(registrationArgs({ token: '', os: 'ios', timeZone: 'UTC', appVersion: null })).toBeNull();
    expect(registrationArgs({ token: 't', os: 'web', timeZone: 'UTC', appVersion: null })).toBeNull();
  });
});

describe('createTapGuard', () => {
  const tap = (id: string, action = 'default') => ({ notification: { request: { identifier: id } }, actionIdentifier: action });
  it('lets each tap through once', () => {
    const guard = createTapGuard();
    expect(guard.first(tap('a'))).toBe(true);
    expect(guard.first(tap('a'))).toBe(false);
    expect(guard.first(tap('b'))).toBe(true);
    expect(guard.first(tap('a', 'other'))).toBe(true);
  });
});

describe('tapRouteFor', () => {
  it('uses the allow list', () => {
    expect(tapRouteFor({ url: '/list' })).toBe('/list');
    expect(tapRouteFor({ url: 'https://evil.example' })).toBe('/pantry');
    expect(tapRouteFor(null)).toBe('/pantry');
    expect(tapRouteFor('x')).toBe('/pantry');
  });
});

describe('toastMessage', () => {
  it('joins title and body', () => {
    expect(toastMessage({ title: 'Shopping list', body: 'Sam added eggs.' })).toBe('Shopping list: Sam added eggs.');
    expect(toastMessage({ title: null, body: 'Hi' })).toBe('Hi');
    expect(toastMessage({})).toBe('New activity in your household');
  });
});

describe('devNotification', () => {
  it('routes each kind to a real screen', () => {
    for (const kind of ['expiring', 'list', 'joined'] as const) {
      const n = devNotification(kind);
      expect(n.data.kind).toBe(kind);
      expect(tapRouteFor(n.data)).toBe(n.data.url);
    }
  });
});
