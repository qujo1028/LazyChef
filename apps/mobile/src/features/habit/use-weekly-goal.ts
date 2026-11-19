import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_GOAL } from '@lazychef/core/habit/constants';

import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

export const GOAL_MIN = 1;
export const GOAL_MAX = 7;

/** The viewer's stored goal; no preferences row yet means the default (3 nights). */
async function fetchWeeklyGoal(userId: string): Promise<number> {
  const { data, error } = await supabase.from('user_preferences').select('weekly_goal').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.weekly_goal ?? DEFAULT_GOAL;
}

/**
 * The viewer's weekly cook goal (nights a week, 1 to 7). Per person: it's never on the household
 * channel, so it refreshes on resume and after saving. Falls back to the default while loading
 * or when it can't be read, so the ring always has a target.
 */
export function useWeeklyGoal(): { goal: number; loaded: boolean } {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const query = useQuery({
    queryKey: queryKeys.weeklyGoal(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: () => fetchWeeklyGoal(userId!),
  });
  return { goal: query.data ?? DEFAULT_GOAL, loaded: query.data !== undefined };
}

/** Saves the goal through set_my_weekly_goal, optimistically, rolling back on failure. */
export function useSetWeeklyGoal() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? 'signed-out';
  const key = queryKeys.weeklyGoal(userId);
  return useMutation({
    mutationFn: async (goal: number) => {
      const { data, error } = await supabase.rpc('set_my_weekly_goal', { p_goal: goal });
      if (error) throw error;
      return data;
    },
    onMutate: async (goal) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<number>(key);
      queryClient.setQueryData(key, goal);
      return { previous };
    },
    onError: (_error, _goal, context) => {
      // setQueryData(undefined) is ignored, so a goal that never loaded is refetched instead.
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
      else void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
  });
}
