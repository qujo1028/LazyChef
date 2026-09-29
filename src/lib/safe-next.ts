const PROBE_ORIGIN = "http://safe-next.invalid"

/**
 * Where to send someone after signing in. Only same-site paths are allowed, so
 * a crafted ?next= link can't bounce people to another website.
 *
 * URL parsers drop tabs/newlines and treat "\" like "/", so "/\t/evil.com" and
 * "/\evil.com" would become "//evil.com". Those characters are refused outright,
 * and the result must still resolve to our own origin.
 */
export function safeNext(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001F\u007F]/.test(value)) {
    return fallback
  }
  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback
  } catch {
    return fallback
  }
  return value
}
