"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAdminAction } from "@/features/admin/audit"
import { requireAdmin } from "@/features/admin/guard"
import { findUserByEmail, grantComp, revokeComp, type SupportUser } from "@/features/admin/support-db"

export type LookupResult = { ok: true; user: SupportUser | null } | { error: string }
export type CompResult = { ok: true } | { error: string }

const GENERIC = "Something went wrong."
const AUDIT_FAILED = "Couldn't record this in the audit log, so nothing was changed."

// The messages our own RPCs raise for bad input (errcode 22023). Only these are shown as-is.
const KNOWN_MESSAGES = new Set([
  "Enter the full email address.",
  "No such user.",
  "Keep the note under 200 characters.",
  "The end date has to be in the future.",
])

function failure(error: unknown): { error: string } {
  if (error instanceof Error && KNOWN_MESSAGES.has(error.message)) return { error: error.message }
  console.error("[admin] support action failed:", error)
  return { error: GENERIC }
}

const EMAIL_TOO_LONG = "That email is too long."
// 200 matches the audit log's target limit, so a lookup that passes here can always be recorded.
const emailSchema = z.string().trim().max(200, EMAIL_TOO_LONG).email("Enter the full email address.")
const userIdSchema = z.string().uuid()
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
  })
const grantSchema = z.object({
  userId: userIdSchema,
  expiresAt: dateSchema.nullable(),
  note: z.string().max(200).nullable(),
})

/** Records the action first. False means it could not be saved, so the caller must stop. */
async function audit(...args: Parameters<typeof logAdminAction>): Promise<boolean> {
  try {
    await logAdminAction(...args)
    return true
  } catch (error) {
    console.error("[admin] audit log failed:", error)
    return false
  }
}

/** Looks up one account by exact email. The lookup is audited before any data is read. */
export async function lookupUser(email: string): Promise<LookupResult> {
  const viewer = await requireAdmin()
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the full email address." }
  const normalized = parsed.data.toLowerCase()

  if (!(await audit(viewer, "user.lookup", normalized))) return { error: AUDIT_FAILED }
  try {
    return { ok: true, user: await findUserByEmail(normalized) }
  } catch (error) {
    return failure(error)
  }
}

export async function grantCompAction(input: {
  userId: string
  expiresAt: string | null
  note: string | null
}): Promise<CompResult> {
  const viewer = await requireAdmin()
  const parsed = grantSchema.safeParse(input)
  if (!parsed.success) return { error: "Check the end date and keep the note under 200 characters." }
  const { userId, expiresAt, note } = parsed.data
  const cleanNote = note?.trim() ? note.trim() : null
  const expiresIso = expiresAt ? `${expiresAt}T23:59:59.999Z` : null

  if (!(await audit(viewer, "comp.grant", userId, { expiresAt: expiresIso, note: cleanNote }))) {
    return { error: AUDIT_FAILED }
  }
  try {
    await grantComp(userId, expiresIso, cleanNote)
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function revokeCompAction(userId: string): Promise<CompResult> {
  const viewer = await requireAdmin()
  const parsed = userIdSchema.safeParse(userId)
  if (!parsed.success) return { error: "That isn't a valid user." }

  if (!(await audit(viewer, "comp.revoke", parsed.data))) return { error: AUDIT_FAILED }
  try {
    await revokeComp(parsed.data)
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
