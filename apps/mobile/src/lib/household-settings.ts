// Pure helpers for the Household tab. No React Native imports so Vitest can run them.

/** The live web app. Invite links open there, so they work for anyone, app or not. */
export const DEFAULT_WEB_URL = 'https://lazychef-gamma.vercel.app';

export const HOUSEHOLD_NAME_MAX = 60;

/** Same rules and copy as the web app's householdName schema. Returns the trimmed name or an error. */
export function validateHouseholdName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: 'Give your household a name.' };
  if (name.length > HOUSEHOLD_NAME_MAX) return { ok: false, error: 'Keep it under 60 characters.' };
  return { ok: true, name };
}

/** "https://site.app/" + "K7QXM2PA" -> "https://site.app/join/K7QXM2PA" (the web invite card's link). */
export function buildInviteLink(webUrl: string | undefined, inviteCode: string): string {
  const base = (webUrl?.trim() || DEFAULT_WEB_URL).replace(/\/+$/, '');
  return `${base}/join/${encodeURIComponent(inviteCode)}`;
}

/**
 * Content for React Native's Share.share. iOS shares `url` as its own item; Android ignores `url`,
 * so the link goes in the message there.
 */
export function inviteShareContent(os: string, householdName: string, link: string) {
  const title = 'Join our LazyChef household';
  const text = `Join "${householdName}" on LazyChef so we share one pantry and shopping list.`;
  return os === 'ios' ? { title, message: text, url: link } : { title, message: `${text} ${link}` };
}

/** "K7QX-M2PA" -> "K 7 Q X, M 2 P A" so screen readers read it one character at a time. */
export function spellInviteCode(pretty: string): string {
  return pretty
    .split('-')
    .map((part) => part.split('').join(' '))
    .join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Joined today", "Joined yesterday", else "Joined Nov 4, 2026" (local time). */
export function formatJoined(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Joined';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86_400_000);
  if (diff === 0) return 'Joined today';
  if (diff === 1) return 'Joined yesterday';
  return `Joined ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export type MemberRow = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile: { display_name: string; avatar_url: string | null } | null;
};

export type HouseholdMember = {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
};

/** Same mapping as the web app's getHouseholdMembers. */
export function toMembers(rows: MemberRow[]): HouseholdMember[] {
  return rows.map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    displayName: m.profile?.display_name?.trim() || 'Housemate',
    avatarUrl: m.profile?.avatar_url ?? null,
  }));
}

export const OFFLINE_ACTION_MESSAGE = "You're offline. Try again when you're back online.";

/** A short message for a failed request. Database errors from the household RPCs are already friendly. */
export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  if (!message) return 'Something went wrong. Please try again.';
  if (/network request failed|failed to fetch|network error|timed? ?out|aborted/i.test(message)) {
    return "Couldn't reach LazyChef. Check your connection and try again.";
  }
  return message;
}

/** Copy for the leave confirmation, matching the web app plus the owner hand-over. */
export function leaveCopy(opts: { householdName: string; memberCount: number; isOwner: boolean }) {
  const title = `Leave ${opts.householdName}?`;
  if (opts.memberCount <= 1) {
    return {
      title,
      message: "You're the only member, so the household and everything in it will be deleted.",
      confirm: 'Leave and delete',
    };
  }
  const handOver = opts.isOwner ? ' Whoever has been in it longest becomes the owner.' : '';
  return {
    title,
    message: `You'll lose access to its pantry and shopping list. Someone can invite you back.${handOver}`,
    confirm: 'Leave',
  };
}
