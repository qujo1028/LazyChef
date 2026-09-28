/** Cookie that remembers an invite link opened while signed out. */
export const PENDING_INVITE_COOKIE = "lazychef-invite"

/** "k7qx - m2pa" → "K7QXM2PA" (same rule as the database). */
export function normalizeInviteCode(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

/** "K7QXM2PA" → "K7QX-M2PA" for display. */
export function formatInviteCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
