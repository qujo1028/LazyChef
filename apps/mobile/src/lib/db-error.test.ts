import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('__DEV__', false);

const { dbErrorMessage, GENERIC_DB_ERROR } = await import('./db-error');

describe('dbErrorMessage', () => {
  it('passes our own SQL messages through', () => {
    expect(dbErrorMessage('x', { code: 'P0001', message: 'Pick a household first.' })).toBe('Pick a household first.');
  });

  it('hides anything else', () => {
    expect(dbErrorMessage('x', { code: '42501', message: 'permission denied for table pantry_items' })).toBe(GENERIC_DB_ERROR);
    expect(dbErrorMessage('x', null)).toBe(GENERIC_DB_ERROR);
  });
});
