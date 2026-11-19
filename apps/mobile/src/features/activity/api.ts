import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVITY_LIMIT, type ActivityRow } from '@lazychef/core/activity/feed';

import { toActivityRow } from '@/lib/activity-screen';
import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { useHouseholdChanges } from '@/providers/household-channel';

/** The household's latest activity (newest first), with each actor's name and photo. Same query as the web feed. */
async function fetchActivity(householdId: string): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select(
      'id, actor_id, action, item_name, quantity, unit, batch_id, details, created_at, actor:profiles!activity_log_actor_id_fkey(display_name, avatar_url)',
    )
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (error) throw error;
  return data.map(toActivityRow);
}

/** The Log view's rows. Refetches whenever anyone's activity lands (or an undo removes rows). */
export function useActivityFeed(householdId: string | null) {
  const queryClient = useQueryClient();
  useHouseholdChanges('activity_log', () => {
    if (householdId) void queryClient.invalidateQueries({ queryKey: queryKeys.activity(householdId) });
  });
  return useQuery({
    queryKey: queryKeys.activity(householdId ?? 'none'),
    enabled: householdId !== null,
    queryFn: () => fetchActivity(householdId!),
  });
}
