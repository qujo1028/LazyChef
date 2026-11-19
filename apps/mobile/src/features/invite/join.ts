import { cleanInviteCode, householdErrorMessage, MESSAGES } from '@/lib/invite-code';
import { classifyPreview, type InvitePreview, type PreviewRow } from '@/lib/invite-preview';
import { notifyHousemates } from '@/features/push/notify';
import { supabase } from '@/lib/supabase';

export type JoinResult = { ok: true; householdId: string } | { ok: false; message: string };

/** Calls join_household. A wrong code comes back as null (not an error) so the database can count it. */
export async function joinWithCode(rawCode: string): Promise<JoinResult> {
  const code = cleanInviteCode(rawCode);
  if (!code) return { ok: false, message: MESSAGES.badCode };
  try {
    const { data, error } = await supabase.rpc('join_household', { p_code: code });
    if (error) return { ok: false, message: householdErrorMessage(error) };
    if (!data) return { ok: false, message: MESSAGES.noMatch };
    notifyHousemates({ event: 'joined', householdId: data });
    return { ok: true, householdId: data };
  } catch (e) {
    return { ok: false, message: householdErrorMessage(e as Error) };
  }
}

/** Looks up the household behind a code without joining it. */
export async function fetchInvitePreview(rawCode: string): Promise<InvitePreview> {
  const code = cleanInviteCode(rawCode);
  if (!code) return { kind: 'invalid' };
  try {
    const { data, error } = await supabase.rpc('get_invite_preview', { p_code: code });
    return classifyPreview(data as PreviewRow[] | null, error);
  } catch (e) {
    return { kind: 'error', message: householdErrorMessage(e as Error) };
  }
}

/** Makes a household you already belong to the active one. */
export async function makeActive(userId: string, householdId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('profiles').update({ active_household_id: householdId }).eq('id', userId);
    return !error;
  } catch {
    return false;
  }
}
