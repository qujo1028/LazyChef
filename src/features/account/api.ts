import "server-only"

import type { DeleteAccountResponse } from "@lazychef/core/push/app-contract"
import { apiFailure, apiOk, authenticate, type BearerAuth } from "@/lib/supabase/bearer"

import { deleteAccountCore, type DeleteAccountDeps } from "./delete"

export type DeleteAccountApiDeps = DeleteAccountDeps & {
  authenticate?: (request: Request) => Promise<BearerAuth | Response>
}

/**
 * POST /api/account/delete for the Expo app: the same deletion as the web's deleteAccount action.
 * The app signs itself out afterwards; the access token it sent stops working with the user gone.
 * Takes no body.
 */
export async function handleDeleteAccount(request: Request, deps: DeleteAccountApiDeps = {}): Promise<Response> {
  const auth = await (deps.authenticate ?? authenticate)(request)
  if (auth instanceof Response) return auth

  const result = await deleteAccountCore(auth.user.id, auth.supabase, deps)
  if (!result.ok) return apiFailure(result.code, result.error)

  const body: DeleteAccountResponse = { ok: true, appleNotRevoked: result.usedApple && !result.appleRevoked }
  return apiOk(body)
}
