// Pure chunking helpers for key-value stores with a small per-value limit (expo-secure-store allows
// about 2 KB per value, and a Supabase session can be larger). No React Native imports, so this is
// unit-testable under Vitest.

export type RawStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

// SecureStore's limit is in bytes. A UTF-16 code unit is at most 3 UTF-8 bytes, so 600 units stay
// under 1800 bytes, leaving headroom below 2048.
export const CHUNK_SIZE = 600;

const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Split into pieces of at most `size` UTF-16 units, never between a surrogate pair. */
export function splitChunks(value: string, size: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + size, value.length);
    if (end < value.length && end - start > 1) {
      const last = value.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end -= 1; // keep the pair together
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

async function readCount(store: RawStore, key: string): Promise<number> {
  const raw = await store.get(countKey(key));
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function createChunkedStorage(store: RawStore, size: number = CHUNK_SIZE) {
  return {
    async getItem(rawKey: string): Promise<string | null> {
      const key = sanitizeKey(rawKey);
      const n = await readCount(store, key);
      if (n === 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await store.get(chunkKey(key, i));
        if (part === null) return null; // torn write: treat as signed out
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(rawKey: string, value: string): Promise<void> {
      const key = sanitizeKey(rawKey);
      const previous = await readCount(store, key);
      const chunks = splitChunks(value, size);
      // Chunks first, then the count, so a reader never sees a count without its data.
      for (let i = 0; i < chunks.length; i++) await store.set(chunkKey(key, i), chunks[i]);
      await store.set(countKey(key), String(chunks.length));
      for (let i = chunks.length; i < previous; i++) await store.remove(chunkKey(key, i));
    },

    async removeItem(rawKey: string): Promise<void> {
      const key = sanitizeKey(rawKey);
      const n = await readCount(store, key);
      await store.remove(countKey(key)); // count first so readers see "empty"
      for (let i = 0; i < n; i++) await store.remove(chunkKey(key, i));
    },
  };
}
