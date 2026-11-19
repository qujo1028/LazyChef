import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COOK_ROW_LIMIT } from '@lazychef/core/habit/constants';
import { toCookEvents, type CookEvent } from '@lazychef/core/habit/cook-events';
import { summarize, type HabitSummary } from '@lazychef/core/habit/summary';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useSession } from '@/lib/use-session';
import { useHouseholdChanges } from '@/providers/household-channel';

/** One 'cooked' activity row, as the habit logic needs it. */
export type CookRowLite = { actorId: string | null; batchId: number; createdAt: string; details: unknown };

/** The household's cook rows, newest first (capped like the web app). */
async function fetchCookRows(householdId: string): Promise<CookRowLite[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('actor_id, batch_id, details, created_at')
    .eq('household_id', householdId)
    .eq('action', 'cooked')
    .order('created_at', { ascending: false })
    .limit(COOK_ROW_LIMIT);
  if (error) throw error;
  return data.map((row) => ({ actorId: row.actor_id, batchId: Number(row.batch_id), createdAt: row.created_at, details: row.details }));
}

/** Every cook in the household. Refetches when anyone's cook (or undo) lands. */
export function useHouseholdCooks(householdId: string | null) {
  const queryClient = useQueryClient();
  useHouseholdChanges('activity_log', (change) => {
    const row = change.record ?? change.oldRecord;
    if (householdId && row?.action === 'cooked') void queryClient.invalidateQueries({ queryKey: queryKeys.cooks(householdId) });
  });
  return useQuery({
    queryKey: queryKeys.cooks(householdId ?? 'none'),
    enabled: householdId !== null,
    queryFn: () => fetchCookRows(householdId!),
  });
}

/** One person's cook events (one per batch), from the household rows. */
export function cookEventsFor(rows: readonly CookRowLite[], userId: string): CookEvent[] {
  return toCookEvents(
    rows
      .filter((row) => row.actorId === userId)
      .map((row) => ({ batchId: row.batchId, createdAt: row.createdAt, details: row.details as never })),
  );
}

/**
 * The viewer's habit: this week's cook days, tier, streak, challenge (packages/core/src/habit),
 * in the device's time zone. `events` is what cookRecipe needs for its before/after reward.
 */
export function useHabit(householdId: string | null): {
  summary: HabitSummary | null;
  events: CookEvent[] | null;
  timeZone: string;
  query: ReturnType<typeof useHouseholdCooks>;
} {
  const query = useHouseholdCooks(householdId);
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const timeZone = deviceTimeZone();
  // Ticks each minute and on resume, so the week and streak roll over at midnight.
  const tick = useNow();
  const now = Math.max(tick, query.dataUpdatedAt);
  const events = useMemo(() => (query.data && userId ? cookEventsFor(query.data, userId) : null), [query.data, userId]);
  const summary = useMemo(() => (events ? summarize(events, now, timeZone) : null), [events, now, timeZone]);
  return { summary, events, timeZone, query };
}
