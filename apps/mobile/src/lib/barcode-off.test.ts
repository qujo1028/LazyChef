import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOffProduct, OFF_TIMEOUT_MS, OpenFoodFactsError, parseOffBody } from './barcode-off';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseOffBody', () => {
  it('returns the product only for status 1', () => {
    expect(parseOffBody({ status: 1, product: { product_name: 'Eggs' } })).toEqual({ product_name: 'Eggs' });
    expect(parseOffBody({ status: 0, product: { product_name: 'Eggs' } })).toBeNull();
    expect(parseOffBody({ status: 1 })).toBeNull();
    expect(parseOffBody(null)).toBeNull();
    expect(parseOffBody('x')).toBeNull();
  });
});

describe('fetchOffProduct', () => {
  it('returns the product on 200 and sends the identifying headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { status: 1, product: { product_name: 'Eggs' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOffProduct('0123456789012')).resolves.toEqual({ product_name: 'Eggs' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v2/product/0123456789012.json?fields=product_name,');
    expect(init.headers['User-Agent']).toBe('LazyChef/1.0 (https://lazychef-gamma.vercel.app)');
    expect(init.headers.Accept).toBe('application/json');
  });

  it('reads 404 and status 0 as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(404, {})).mockResolvedValueOnce(reply(200, { status: 0 })));
    await expect(fetchOffProduct('1')).resolves.toBeNull();
    await expect(fetchOffProduct('1')).resolves.toBeNull();
  });

  it('throws on 500 and on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(500, {})).mockRejectedValueOnce(new TypeError('offline')));
    await expect(fetchOffProduct('1')).rejects.toBeInstanceOf(OpenFoodFactsError);
    await expect(fetchOffProduct('1')).rejects.toBeInstanceOf(OpenFoodFactsError);
  });

  it('aborts after the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
      ),
    );
    const pending = expect(fetchOffProduct('1')).rejects.toBeInstanceOf(OpenFoodFactsError);
    await vi.advanceTimersByTimeAsync(OFF_TIMEOUT_MS);
    await pending;
  });
});
