import { FALLBACK_TIME_ZONE, validTimeZone } from '@lazychef/core/habit/timezone';

/** The device's IANA time zone (the web app reads it from a cookie; the app asks the OS). */
export function deviceTimeZone(): string {
  try {
    return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}
