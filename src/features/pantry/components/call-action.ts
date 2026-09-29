import { unstable_rethrow } from "next/navigation"

import type { ActionResult } from "../types"

export const CONNECTION_ERROR = "Couldn't reach LazyChef. Check your connection and try again."

/**
 * Runs a server action. A dropped connection (one bar at the store) or a stale deploy makes
 * the call throw, which would swap the whole page for an error screen and lose what was
 * typed; it becomes an ordinary `{ error }` instead. Redirects (e.g. signed out) still happen.
 */
export async function callAction<T>(action: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action()
  } catch (error) {
    unstable_rethrow(error)
    console.error(error)
    return { error: CONNECTION_ERROR }
  }
}
