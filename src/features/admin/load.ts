import "server-only"

import { GitHubError } from "@/features/admin/github"

/** Thrown by data helpers when SUPABASE_SECRET_KEY (or the URL) isn't set. */
export class MissingServerDbError extends Error {
  constructor() {
    super("Set SUPABASE_SECRET_KEY to load this.")
    this.name = "MissingServerDbError"
  }
}

export type Loaded<T> =
  | { ok: true; data: T }
  /** `off`: a token or key isn't set. `error`: it is set but the call failed. */
  | { ok: false; kind: "off" | "error"; message: string }

/**
 * Runs one card's data load and never throws, so one failing source (GitHub down, a key
 * missing) degrades its own card instead of the whole admin page. Messages are safe to show
 * to admins; anything unexpected is logged and shown generically.
 */
export async function loadSafely<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() }
  } catch (error) {
    if (error instanceof GitHubError) {
      return { ok: false, kind: error.code === "no_config" ? "off" : "error", message: error.message }
    }
    if (error instanceof MissingServerDbError) return { ok: false, kind: "off", message: error.message }
    console.error("[admin] load failed:", error)
    return { ok: false, kind: "error", message: "Couldn't load this. Check the server logs." }
  }
}
