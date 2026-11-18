// Supabase's messages are written for developers; these are for housemates. Pure TypeScript so
// Vitest can cover it. Copy follows friendlyAuthError in the web app's src/features/auth/actions.ts.

export const GENERIC_AUTH_ERROR = "Something went wrong. Try again in a moment.";
export const OFFLINE_AUTH_ERROR = "Couldn't reach LazyChef. Check your connection and try again.";
export const LINK_FAILED =
  "That link didn't work. It may have expired or been opened on another device. Try signing in.";

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown; name?: unknown };

const BY_CODE: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  email_not_confirmed: "Confirm your email first. The link is in your inbox.",
  user_already_exists: "There's already an account with that email. Try signing in.",
  email_exists: "There's already an account with that email. Try signing in.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  weak_password: "Use an uppercase letter, a lowercase letter, a number and a symbol.",
  same_password: "Pick a password you haven't used here before.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized: "We couldn't send an email to that address. Try a different one.",
  signup_disabled: "New accounts are paused right now. Try again later.",
  user_banned: "This account can't sign in right now.",
  otp_expired: LINK_FAILED,
  flow_state_not_found: LINK_FAILED,
  flow_state_expired: LINK_FAILED,
  bad_code_verifier: LINK_FAILED,
  bad_oauth_state: LINK_FAILED,
  bad_oauth_callback: LINK_FAILED,
  provider_disabled: "That sign-in option isn't turned on yet. Use your email instead.",
  oauth_provider_not_supported: "That sign-in option isn't turned on yet. Use your email instead.",
  session_not_found: "You've been signed out. Sign in again.",
  session_expired: "You've been signed out. Sign in again.",
  request_timeout: OFFLINE_AUTH_ERROR,
};

const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/already registered|already exists/i, BY_CODE.user_already_exists],
  [/rate limit/i, BY_CODE.over_request_rate_limit],
  [/password should be at least/i, "Pick a longer password (at least 8 characters)."],
  [/password should contain/i, BY_CODE.weak_password],
  [/network request failed|failed to fetch|network error/i, OFFLINE_AUTH_ERROR],
];

/** A short, friendly sentence for any error thrown or returned by supabase-js auth. */
export function friendlyAuthError(error: unknown): string {
  if (!error || typeof error !== "object") return GENERIC_AUTH_ERROR;
  const { message, code, status, name } = error as ErrorLike;
  if (typeof code === "string" && BY_CODE[code]) return BY_CODE[code];
  if (typeof status === "number" && status === 429) return BY_CODE.over_request_rate_limit;
  if (name === "AuthRetryableFetchError") return OFFLINE_AUTH_ERROR;
  if (typeof message === "string") {
    const known = BY_MESSAGE.find(([pattern]) => pattern.test(message));
    if (known) return known[1];
  }
  return GENERIC_AUTH_ERROR;
}

/**
 * The OAuth `error` / `error_description` from a redirect back into the app. The text comes from
 * a link anyone can craft, so it's mapped to our own copy and never shown as is.
 */
export function friendlyCallbackError(error: string | null, description: string | null): string {
  const text = `${error ?? ""} ${description ?? ""}`;
  if (/access_denied|cancel/i.test(text)) return "Sign in was cancelled. Try again when you're ready.";
  if (/expired|invalid/i.test(text)) return LINK_FAILED;
  return GENERIC_AUTH_ERROR;
}
