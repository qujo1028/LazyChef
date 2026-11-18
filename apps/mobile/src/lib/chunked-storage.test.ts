import { describe, expect, it } from 'vitest';

import { createChunkedStorage, sanitizeKey, splitChunks, type RawStore } from './chunked-storage';

function memoryStore(limit = 2048) {
  const map = new Map<string, string>();
  const store: RawStore = {
    get: async (k) => map.get(k) ?? null,
    set: async (k, v) => {
      if (new TextEncoder().encode(v).length > limit) throw new Error('value too large');
      map.set(k, v);
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
  return { map, store };
}

describe('splitChunks', () => {
  it('round-trips and respects size', () => {
    const s = 'a'.repeat(1301);
    const parts = splitChunks(s, 600);
    expect(parts.map((p) => p.length)).toEqual([600, 600, 101]);
    expect(parts.join('')).toBe(s);
  });
  it('does not split surrogate pairs', () => {
    const s = 'a' + '😀'.repeat(5);
    const parts = splitChunks(s, 2);
    for (const p of parts) expect(new TextDecoder().decode(new TextEncoder().encode(p))).toBe(p);
    expect(parts.join('')).toBe(s);
  });
  it('returns no chunks for an empty string', () => {
    expect(splitChunks('')).toEqual([]);
  });
});

describe('createChunkedStorage', () => {
  it('stores a large unicode value under the byte limit and reads it back', async () => {
    const { store, map } = memoryStore();
    const s = createChunkedStorage(store);
    const value = JSON.stringify({ t: 'x'.repeat(5000), n: '日本語😀'.repeat(800) });
    await s.setItem('sb-abc-auth-token', value);
    expect(map.size).toBeGreaterThan(2);
    expect(await s.getItem('sb-abc-auth-token')).toBe(value);
  });
  it('removes stale chunks when a value shrinks', async () => {
    const { store, map } = memoryStore();
    const s = createChunkedStorage(store, 10);
    await s.setItem('k', 'x'.repeat(50));
    await s.setItem('k', 'short');
    expect([...map.keys()].sort()).toEqual(['k.0', 'k.n']);
    expect(await s.getItem('k')).toBe('short');
  });
  it('removeItem clears every key', async () => {
    const { store, map } = memoryStore();
    const s = createChunkedStorage(store, 10);
    await s.setItem('k', 'x'.repeat(50));
    await s.removeItem('k');
    expect(map.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });
  it('returns null for a missing key or a torn write', async () => {
    const { store, map } = memoryStore();
    const s = createChunkedStorage(store, 10);
    expect(await s.getItem('nope')).toBeNull();
    await s.setItem('k', 'x'.repeat(50));
    map.delete('k.2');
    expect(await s.getItem('k')).toBeNull();
  });
  it('sanitizes keys', () => {
    expect(sanitizeKey('a:b/c d')).toBe('a_b_c_d');
  });
});
