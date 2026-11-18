import "server-only"

import { notFound } from "next/navigation"
import { cache } from "react"

import { requireViewer } from "@/features/household/queries"

/** ADMIN_EMAILS as a set of lowercased addresses. Unset or blank means no admins. */
export function parseAdminEmails(raw: string | null | undefined): Set<string> {
  const emails = new Set<string>()
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim().toLowerCase()
    if (email) emails.add(email)
  }
  return emails
}

/** Fails closed: no email, or no configured admins, is never an admin. */
export function isAdminEmail(email: string | null | undefined, raw: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  return parseAdminEmails(raw).has(normalized)
}

/**
 * For /admin pages: the signed-in viewer if their email is in ADMIN_EMAILS.
 * Signed-out users go to /login; everyone else gets a 404 so the dashboard stays hidden.
 */
export const requireAdmin = cache(async () => {
  const viewer = await requireViewer()
  if (!isAdminEmail(viewer.email, process.env.ADMIN_EMAILS)) notFound()
  return viewer
})
