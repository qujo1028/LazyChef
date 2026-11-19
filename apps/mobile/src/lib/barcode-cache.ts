// A per-session memory of barcode lookups (code -> result), so a re-scan doesn't refetch.
// Keyed by household too, so switching households never shows another household's names.
export function createLookupCache<T>(max = 200) {
  const map = new Map<string, T>();
  const key = (householdId: string, code: string) => `${householdId}:${code}`;
  return {
    get: (householdId: string, code: string) => map.get(key(householdId, code)),
    set(householdId: string, code: string, value: T) {
      const k = key(householdId, code);
      map.delete(k);
      map.set(k, value);
      if (map.size > max) map.delete(map.keys().next().value as string);
    },
    delete: (householdId: string, code: string) => map.delete(key(householdId, code)),
    clear: () => map.clear(),
  };
}
