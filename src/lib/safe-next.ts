/**
 * Where to send someone after signing in. Only same-site paths are allowed, so
 * a crafted ?next= link can't bounce people to another website.
 */
export function safeNext(value: unknown, fallback = "/") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback
  }
  return value
}
