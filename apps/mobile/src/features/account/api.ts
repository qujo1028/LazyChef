import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_API, type DeleteAccountResponse } from '@lazychef/core/push/app-contract';
import { NO_PREFERENCES, preferencesSchema, type FoodPreferences } from '@lazychef/core/preferences/options';

import { setAccountNotice } from '@/lib/account-notice';
import { deleteOutcome, validateDisplayName, type DeleteOutcome } from '@/lib/account';
import { queryKeys } from '@/lib/household';
import { prefsFromRow } from '@/lib/preferences';
import { queryClient as appQueryClient, queryPersister } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { callWebApi } from '@/lib/web-api';

/** Saves the display name (profiles update as the signed-in person, 1 to 60 characters). */
export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async (raw: string) => {
      const checked = validateDisplayName(raw);
      if (!checked.ok) throw new Error(checked.error);
      const userId = session?.user.id;
      if (!userId) throw new Error('Sign in again to do that.');
      const { error } = await supabase.from('profiles').update({ display_name: checked.name }).eq('id', userId);
      if (error) throw error;
      return checked.name;
    },
    // The household context carries the profile; the members list shows the name too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
  });
}

const prefsKey = (userId: string) => ['household', 'preferences', userId] as const;

/** The viewer's saved food preferences (no row yet reads as no restrictions). */
export function useFoodPreferences() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: prefsKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<FoodPreferences> => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('diet, allergies, cuisines, world_recipes')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return prefsFromRow(data);
    },
  });
}

/** Saves through set_my_preferences, then refreshes recipe ideas, which read these. */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? 'signed-out';
  return useMutation({
    mutationFn: async (input: FoodPreferences) => {
      const parsed = preferencesSchema.safeParse(input);
      if (!parsed.success) throw new Error("Those preferences didn't look right. Try again.");
      const { diet, allergies, cuisines, worldRecipes } = parsed.data;
      const { error } = await supabase.rpc('set_my_preferences', {
        p_diet: diet,
        p_allergies: allergies,
        p_cuisines: cuisines,
        p_world_recipes: worldRecipes,
      });
      if (error) throw error;
      return parsed.data;
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(prefsKey(userId), saved ?? NO_PREFERENCES);
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'household' && q.queryKey[1] === 'recipes' });
    },
  });
}

/** Signs out on this phone only; the route gate sends the person to the welcome screen. */
export async function signOutLocal(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Deletes the account through the web route. On success the cache is cleared, the notice is left
 * for the welcome screen and the phone signs out locally (the server session is already gone).
 */
export async function deleteAccount(): Promise<DeleteOutcome> {
  const result = await callWebApi<DeleteAccountResponse>(APP_API.deleteAccount, {});
  let outcome = deleteOutcome(result);
  // A timeout or dropped connection may hide a delete that finished: ask the server if the account is still there.
  if (outcome.kind === 'error' && !result.ok && result.code === 'offline' && (await accountIsGone())) {
    outcome = deleteOutcome({ ok: true, appleNotRevoked: false });
  }
  if (outcome.kind === 'deleted') {
    const error = await finishDeleted(outcome);
    if (error) return { kind: 'error', message: error };
  }
  return outcome;
}

/** True only when the server answers that this login no longer has a user; network trouble is "unknown". */
async function accountIsGone(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return false;
    return error?.status === 401 || error?.status === 403 || error?.status === 404;
  } catch {
    return false;
  }
}

/** Returns an error message when the local sign out fails (the notice is cleared then). */
async function finishDeleted(outcome: Extract<DeleteOutcome, { kind: 'deleted' }>): Promise<string | null> {
  setAccountNotice({ message: outcome.message, appleNote: outcome.appleNote });
  appQueryClient.clear();
  try {
    await queryPersister.removeClient();
  } catch {
    // The sign out below clears it again.
  }
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    return null;
  } catch {
    setAccountNotice(null);
    return 'Your account is deleted, but this phone could not sign out. Close and reopen LazyChef.';
  }
}
