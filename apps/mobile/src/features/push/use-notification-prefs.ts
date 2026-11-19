import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PREFS, type NotificationPrefs } from '@lazychef/core/push/prefs';

import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

/** The viewer's three push switches. No row yet means everything is on. */
export function useNotificationPrefs() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: queryKeys.notificationPrefs(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('expiring, list, joined')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_PREFS;
    },
  });
}

/** Saves one switch through set_my_notification_prefs, optimistically, rolling back on failure. */
export function useSetNotificationPref() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const key = queryKeys.notificationPrefs(session?.user.id ?? 'signed-out');
  return useMutation({
    mutationFn: async (change: Partial<NotificationPrefs>) => {
      const { error } = await supabase.rpc('set_my_notification_prefs', {
        p_expiring: change.expiring ?? null,
        p_list: change.list ?? null,
        p_joined: change.joined ?? null,
      });
      if (error) throw error;
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPrefs>(key);
      queryClient.setQueryData<NotificationPrefs>(key, { ...(previous ?? DEFAULT_PREFS), ...change });
      return { previous };
    },
    onError: (_error, _change, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
