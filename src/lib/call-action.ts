import { unstable_rethrow } from "next/navigation"

export const CONNECTION_ERROR = "Couldn't reach LazyChef. Check your connection and try again."

/**
 * Runs a server action. A dropped connection (one bar at the store) or a stale deploy makes
 * the call throw, which would swap the whole page for an error screen and lose what was
 * typed; it becomes an ordinary `{ error }` instead. Redirects (e.g. signed out) still happen.
 */
export async function callAction<R>(action: () => Promise<R>): Promise<R | { error: string }> {
  try {
    return await action()
  } catch (error) {
    unstable_rethrow(error)
    console.error(error)
    return { error: CONNECTION_ERROR }
  }
}

/** The error message in an action's result, if any (for actions that may return nothing). */
export function actionError(result: unknown): string | undefined {
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error) {
    return result.error
  }
  return undefined
}

/**
 * The same protection for a useActionState action: a thrown call becomes the previous
 * state plus `{ error }`, so the form (and what was typed) stays put.
 */
export function withConnectionErrors<S extends { error?: string } | undefined, P>(
  action: (state: S, payload: P) => Promise<S>,
): (state: S, payload: P) => Promise<S> {
  return async (state, payload) => {
    try {
      return await action(state, payload)
    } catch (error) {
      unstable_rethrow(error)
      console.error(error)
      return { ...(state ?? {}), error: CONNECTION_ERROR } as S
    }
  }
}
