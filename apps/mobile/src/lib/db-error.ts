// Pure: database and network errors as text people can read.

/** Messages our own SQL functions raise for people to read (see the pantry and list migrations). */
const READABLE_CODES = new Set(['P0001', 'P0002']);

export const GENERIC_DB_ERROR = "That didn't go through. Check your connection and try again.";

/** A Supabase error as something to show: ours as is, anything else replaced (and logged in dev). */
export function dbErrorMessage(action: string, error: { message: string; code?: string } | null | undefined): string {
  if (error?.code && READABLE_CODES.has(error.code)) return error.message;
  if (__DEV__) console.warn(`[db] ${action} failed:`, error?.code ?? '', error?.message ?? error);
  return GENERIC_DB_ERROR;
}
