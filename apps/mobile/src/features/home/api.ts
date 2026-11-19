import { useQuery } from '@tanstack/react-query';
import { dayKey } from '@lazychef/core/dates/time';
import { buildHomeRecipes, type PoolRecipe, type TrendingRow } from '@lazychef/core/home/trending';
import { useMemo } from 'react';

import { queryKeys } from '@/lib/household';
import { supabase } from '@/lib/supabase';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';

/** PostgREST's cap; the core library is smaller, so this reads all of it. */
const POOL_LIMIT = 1000;
const ROW_LIMIT = 10;

/**
 * Recipes at least 2 households cooked this week (get_trending_recipes). Library data, not household
 * data: no realtime. Refetches when the app comes back (focusManager follows AppState) once stale.
 */
export function useTrendingRecipes() {
  return useQuery({
    queryKey: queryKeys.trending(),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TrendingRow[]> => {
      const { data, error } = await supabase.rpc('get_trending_recipes', { p_limit: ROW_LIMIT });
      if (error) throw error;
      return data;
    },
  });
}

/** The shared core library (no household recipes, no Extended-only or hidden ones), to top the row up. Changes rarely. */
export function useLibraryPool() {
  return useQuery({
    queryKey: queryKeys.libraryPool(),
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: async (): Promise<PoolRecipe[]> => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, image_url, ready_in_minutes')
        .is('household_id', null)
        .eq('extended', false)
        .eq('hidden', false)
        .order('id')
        .limit(POOL_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

/** The Home recipe row: trending first, then the day's library picks. */
export function useHomeRecipes() {
  const trending = useTrendingRecipes();
  const pool = useLibraryPool();
  const now = useNow();
  const day = dayKey(now, deviceTimeZone());
  const cards = useMemo(
    () => buildHomeRecipes(trending.data ?? [], pool.data ?? [], day),
    [trending.data, pool.data, day],
  );
  // The row has something to show once either read has answered; the other fills in later.
  const hasData = trending.data !== undefined || pool.data !== undefined;
  return {
    cards,
    hasData,
    isError: trending.isError && pool.isError,
    isFetching: trending.isFetching || pool.isFetching,
    error: trending.error ?? pool.error,
    refetch: () => Promise.all([trending.refetch(), pool.refetch()]),
  };
}
