// Pure: turns the result of public.get_invite_preview() into one of four outcomes.
import { householdErrorMessage, isRateLimited, type RpcError } from './invite-code';

export type PreviewRow = { household_id: string; household_name: string; member_count: number; is_member: boolean };

export type InvitePreview =
  | { kind: 'found'; householdId: string; name: string; memberCount: number; isMember: boolean }
  | { kind: 'invalid' }
  | { kind: 'limited'; message: string }
  | { kind: 'error'; message: string };

/** An empty result is a wrong code (the database counts it against the guess limit). */
export function classifyPreview(rows: PreviewRow[] | null | undefined, error: RpcError | null | undefined): InvitePreview {
  if (error) {
    const message = householdErrorMessage(error);
    return isRateLimited(error) ? { kind: 'limited', message } : { kind: 'error', message };
  }
  const row = rows?.[0];
  if (!row) return { kind: 'invalid' };
  return {
    kind: 'found',
    householdId: row.household_id,
    name: row.household_name,
    memberCount: row.member_count,
    isMember: row.is_member,
  };
}
