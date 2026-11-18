import { describe, expect, it } from 'vitest';

import { buildCallbackUrl, callbackParamsFromSearch, callbackParamsFromUrl } from './callback-url';
import { createOnceRunner } from './once';

describe('buildCallbackUrl', () => {
  it('adds next and provider', () => {
    expect(buildCallbackUrl('app.lazychef://auth/callback', '/reset-password')).toBe(
      'app.lazychef://auth/callback?next=%2Freset-password',
    );
    expect(buildCallbackUrl('app.lazychef://auth/callback', '/', 'apple')).toBe(
      'app.lazychef://auth/callback?next=%2F&provider=apple',
    );
  });
  it('keeps an existing query', () => {
    expect(buildCallbackUrl('exp://1.2.3.4:8081/--/auth/callback?x=1', '/')).toBe(
      'exp://1.2.3.4:8081/--/auth/callback?x=1&next=%2F',
    );
  });
});

describe('callbackParamsFromSearch', () => {
  it('reads the code and takes the first of repeated values', () => {
    expect(callbackParamsFromSearch({ code: ['abc', 'def'], next: '/pantry' })).toEqual({
      code: 'abc',
      error: null,
      errorDescription: null,
      next: '/pantry',
    });
  });
  it('treats empty values as missing', () => {
    expect(callbackParamsFromSearch({ code: '' }).code).toBeNull();
  });
});

describe('callbackParamsFromUrl', () => {
  it('reads the query', () => {
    const params = callbackParamsFromUrl('app.lazychef://auth/callback?code=abc&next=%2F');
    expect(params?.code).toBe('abc');
    expect(params?.next).toBe('/');
  });
  it('reads errors from the fragment', () => {
    const params = callbackParamsFromUrl('app.lazychef://auth/callback#error=access_denied&error_description=Nope');
    expect(params?.error).toBe('access_denied');
    expect(params?.errorDescription).toBe('Nope');
  });
  it('is null for junk', () => {
    expect(callbackParamsFromUrl('not a url')).toBeNull();
  });
});

describe('createOnceRunner', () => {
  it('runs a key once and shares the result', async () => {
    let calls = 0;
    const run = createOnceRunner(async (key) => {
      calls += 1;
      return key.toUpperCase();
    });
    const [a, b] = await Promise.all([run('x'), run('x')]);
    expect([a, b, calls]).toEqual(['X', 'X', 1]);
    await run('y');
    expect(calls).toBe(2);
  });
});
