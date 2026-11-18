import { describe, expect, it } from 'vitest';

import {
  friendlyAuthError,
  friendlyCallbackError,
  GENERIC_AUTH_ERROR,
  LINK_FAILED,
  OFFLINE_AUTH_ERROR,
} from './errors';

describe('friendlyAuthError', () => {
  it('maps codes', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials', message: 'x' })).toBe("That email and password don't match.");
    expect(friendlyAuthError({ code: 'email_not_confirmed' })).toContain('Confirm your email');
  });
  it('maps messages when there is no code', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe("That email and password don't match.");
    expect(friendlyAuthError({ message: 'Email rate limit exceeded' })).toContain('Too many');
  });
  it('maps a 429 and network failures', () => {
    expect(friendlyAuthError({ status: 429, message: 'x' })).toContain('Too many');
    expect(friendlyAuthError({ name: 'AuthRetryableFetchError', message: 'Network request failed' })).toBe(
      OFFLINE_AUTH_ERROR,
    );
  });
  it('never shows an unknown message as is', () => {
    expect(friendlyAuthError({ message: 'pg: relation does not exist' })).toBe(GENERIC_AUTH_ERROR);
    expect(friendlyAuthError(null)).toBe(GENERIC_AUTH_ERROR);
  });
});

describe('friendlyCallbackError', () => {
  it('handles cancel, expiry and the rest', () => {
    expect(friendlyCallbackError('access_denied', null)).toContain('cancelled');
    expect(friendlyCallbackError('otp_expired', 'Email link is invalid or has expired')).toBe(LINK_FAILED);
    expect(friendlyCallbackError('server_error', '<script>')).toBe(GENERIC_AUTH_ERROR);
  });
});
