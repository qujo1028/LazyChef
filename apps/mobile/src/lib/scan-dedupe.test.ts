import { describe, expect, it } from 'vitest';

import { acceptScan, SCAN_REPEAT_MS } from './scan-dedupe';

describe('acceptScan', () => {
  it('accepts the first read', () => {
    expect(acceptScan(null, '123', 1000)).toEqual({ accept: true, next: { code: '123', at: 1000 } });
  });

  it('ignores the same code inside the window and keeps the old time', () => {
    const first = acceptScan(null, '123', 1000).next;
    const second = acceptScan(first, '123', 1000 + SCAN_REPEAT_MS - 1);
    expect(second.accept).toBe(false);
    expect(second.next).toBe(first);
  });

  it('accepts the same code once the window has passed', () => {
    const first = acceptScan(null, '123', 1000).next;
    expect(acceptScan(first, '123', 1000 + SCAN_REPEAT_MS).accept).toBe(true);
  });

  it('accepts a different code right away', () => {
    const first = acceptScan(null, '123', 1000).next;
    expect(acceptScan(first, '456', 1100)).toEqual({ accept: true, next: { code: '456', at: 1100 } });
  });

  it('ignores empty codes', () => {
    expect(acceptScan(null, '', 1000).accept).toBe(false);
  });
});
