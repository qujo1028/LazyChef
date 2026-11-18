import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { buildInviteLink, OFFLINE_ACTION_MESSAGE, toMembers } from '@/lib/household-settings';
import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';

/** Join link for an invite code. EXPO_PUBLIC_WEB_URL overrides the live site (for a preview deploy). */
export function inviteLinkFor(inviteCode: string) {
  return buildInviteLink(process.env.EXPO_PUBLIC_WEB_URL, inviteCode);
}

/** Everyone in the household, oldest member first. Lives under queryKeys.all so realtime refreshes it. */
export function useHouseholdMembers(householdId: string | null) {
  return useQuery({
    queryKey: queryKeys.members(householdId ?? 'none'),
    enabled: householdId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
        .eq('household_id', householdId!)
        .order('joined_at');
      if (error) throw error;
      return toMembers(data);
    },
  });
}

class OfflineError extends Error {
  constructor() {
    super(OFFLINE_ACTION_MESSAGE);
  }
}

/**
 * A household change that refreshes every household query when it lands. It fails straight away
 * offline (instead of the default of pausing quietly until the connection is back).
 */
function useHouseholdAction<TVars>(run: (vars: TVars) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (vars: TVars) => {
      if (!onlineManager.isOnline()) throw new OfflineError();
      await run(vars);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
}

export function useRenameHousehold() {
  return useHouseholdAction(async ({ householdId, name }: { householdId: string; name: string }) => {
    const { data, error } = await supabase.from('households').update({ name }).eq('id', householdId).select('id');
    if (error) throw error;
    // RLS hides the row from anyone but the owner, so nothing comes back.
    if (data.length === 0) throw new Error('Only the household owner can rename it.');
  });
}

export function useRegenerateInviteCode() {
  return useHouseholdAction(async (householdId: string) => {
    const { error } = await supabase.rpc('regenerate_invite_code', { p_household_id: householdId });
    if (error) throw error;
  });
}

export function useRemoveMember() {
  return useHouseholdAction(async ({ householdId, userId }: { householdId: string; userId: string }) => {
    const { error } = await supabase.rpc('remove_member', { p_household_id: householdId, p_user_id: userId });
    if (error) throw error;
  });
}

export function useLeaveHousehold() {
  return useHouseholdAction(async (householdId: string) => {
    const { error } = await supabase.rpc('leave_household', { p_household_id: householdId });
    if (error) throw error;
  });
}

export function useSwitchHousehold() {
  return useHouseholdAction(async ({ userId, householdId }: { userId: string; householdId: string }) => {
    const { error } = await supabase.from('profiles').update({ active_household_id: householdId }).eq('id', userId);
    if (error) throw error;
  });
}
