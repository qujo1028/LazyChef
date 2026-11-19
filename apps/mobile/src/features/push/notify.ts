import type { NotifyRequest } from '@lazychef/core/push/app-contract';

// P6 W4 fills this in: POST APP_API.notify through callWebApi (lib/web-api.ts), fire and forget.
// Called after a successful list add and after joining a household. Never throws, never blocks
// the caller, and never shows an error (a missed push isn't the person's problem).
export function notifyHousemates(request: NotifyRequest): void {
  void request;
}
