import { APP_API, type NotifyRequest, type NotifyResponse } from '@lazychef/core/push/app-contract';

import { callWebApi } from '@/lib/web-api';

/**
 * Tells the server something housemates may want to hear about (POST APP_API.notify). Fire and
 * forget: never throws, never blocks the caller and never shows an error (a missed push isn't
 * the person's problem). The server dedupes, so calling it twice is safe.
 */
export function notifyHousemates(request: NotifyRequest): void {
  try {
    void callWebApi<NotifyResponse>(APP_API.notify, request).catch(() => undefined);
  } catch {
    // Nothing to do: see above.
  }
}
