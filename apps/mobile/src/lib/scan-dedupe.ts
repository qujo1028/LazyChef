// Pure: ignores the same barcode seen again right away (the camera reads a code many times a second).

export const SCAN_REPEAT_MS = 2500;

export type ScanMemory = { code: string; at: number } | null;

/**
 * Whether a read should count. The same code within `windowMs` of its last accepted read is
 * ignored (and does not extend the window); a different code, or the same one later, counts.
 */
export function acceptScan(
  last: ScanMemory,
  code: string,
  now: number,
  windowMs: number = SCAN_REPEAT_MS,
): { accept: boolean; next: ScanMemory } {
  if (!code) return { accept: false, next: last };
  if (last && last.code === code && now - last.at < windowMs) return { accept: false, next: last };
  return { accept: true, next: { code, at: now } };
}
