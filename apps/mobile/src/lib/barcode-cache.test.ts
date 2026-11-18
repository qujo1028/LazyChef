import { describe, expect, it } from 'vitest';

import { createLookupCache } from './barcode-cache';

describe('createLookupCache', () => {
  it('keeps results per household and code', () => {
    const cache = createLookupCache<string>();
    cache.set('h1', '123', 'a');
    expect(cache.get('h1', '123')).toBe('a');
    expect(cache.get('h2', '123')).toBeUndefined();
    cache.delete('h1', '123');
    expect(cache.get('h1', '123')).toBeUndefined();
  });

  it('drops the oldest entry past the limit', () => {
    const cache = createLookupCache<number>(2);
    cache.set('h', '1', 1);
    cache.set('h', '2', 2);
    cache.set('h', '3', 3);
    expect(cache.get('h', '1')).toBeUndefined();
    expect(cache.get('h', '3')).toBe(3);
  });
});
