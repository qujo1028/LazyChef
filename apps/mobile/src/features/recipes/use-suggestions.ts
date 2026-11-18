// The Suggested filter's data: recipes from our own library first, then Spoonacular (through the
// Edge Function) only when the library gives fewer than LOCAL_ENOUGH ideas. The fetch is keyed on
// the pantry's match keys, not its quantities, so using up an egg re-ranks on screen without a
// new fetch. Diet and cuisine preferences are not applied yet (they come with the preferences screen).
import { pantryMatchKeys } from '@lazychef/core/recipes/local-match';
import { buildPantryIndex, pantrySearchNames } from '@lazychef/core/recipes/match';
import type { RecipeSummary } from '@lazychef/core/recipes/recipe-shapes';
import type { RecipeQuota } from '@lazychef/core/recipes/edge-contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { queryKeys } from '@/lib/household';
import { buildIdeas, hashKey, localIdeaCount, wantsSpoonacular } from '@/lib/recipe-ideas';
import { quotaNotice } from '@/lib/recipe-quota';
import { useOffline } from '@/lib/use-offline';
import { useToday } from '@/lib/use-today';

import { usePantry } from '../pantry/pantry-provider';
import { callRecipes } from './edge';
import { findLocalCandidates, type LocalCard } from './local';

type IdeasData = {
  candidates: LocalCard[];
  /** Spoonacular's recipes, or null when it wasn't asked or didn't answer. */
  extra: RecipeSummary[] | null;
  quota: RecipeQuota | null;
  failure: { code: string } | null;
  /** The library read failed (the screen says so and still shows what Spoonacular gave). */
  localFailed: boolean;
};

/** `search` is the trimmed title search, or null for the pantry's ideas. */
export function useSuggestions(search: string | null, enabled: boolean) {
  const { householdId, items, query: pantryQuery } = usePantry();
  const today = useToday();
  const offline = useOffline();

  const rows = useMemo(() => [...items.values()], [items]);
  const index = useMemo(() => buildPantryIndex(rows, today), [rows, today]);
  const signature = useMemo(() => hashKey(JSON.stringify(pantryMatchKeys(rows))), [rows]);
  const latest = useRef({ rows, today });
  useEffect(() => {
    latest.current = { rows, today };
  });

  const pantryReady = pantryQuery.data !== undefined || items.size > 0;
  const hasNames = useMemo(() => pantrySearchNames(rows, today).length > 0, [rows, today]);
  // Without a pantry there is nothing to suggest, but a search still looks through the library.
  const wanted = enabled && householdId !== null && pantryReady && (hasNames || search !== null);

  const ideasQuery = useQuery({
    queryKey: queryKeys.recipes(householdId ?? 'none', 'ideas', search ?? '', signature, today),
    enabled: wanted,
    queryFn: async (): Promise<IdeasData> => {
      const { rows: current, today: day } = latest.current;
      let candidates: LocalCard[] = [];
      let localFailed = false;
      try {
        candidates = await findLocalCandidates(householdId!, current, search);
      } catch {
        // Before the library migration is applied, or on a hiccup: Spoonacular alone.
        localFailed = true;
      }
      const names = pantrySearchNames(current, day);
      const localCount = localIdeaCount(buildPantryIndex(current, day), candidates, search !== null);
      if (!wantsSpoonacular(localCount, false) || (names.length === 0 && search === null)) {
        return { candidates, extra: null, quota: null, failure: null, localFailed };
      }
      const response = await callRecipes({
        action: 'suggest',
        householdId: householdId!,
        names,
        filters: { type: null, maxTime: null, query: search },
      });
      if (response.error !== undefined) {
        return { candidates, extra: null, quota: response.quota ?? null, failure: { code: response.code }, localFailed };
      }
      return { candidates, extra: response.recipes, quota: response.quota, failure: null, localFailed };
    },
  });

  const quotaQuery = useQuery({
    queryKey: queryKeys.recipeQuota(),
    enabled: enabled && !offline,
    staleTime: 5 * 60 * 1000,
    queryFn: () => callRecipes({ action: 'quota' }),
  });

  const data = ideasQuery.data;
  const ideas = useMemo(
    () => (data ? buildIdeas(index, data.candidates, data.extra, search !== null) : null),
    [data, index, search],
  );

  const quotaResult = quotaQuery.data;
  const quota = data?.quota ?? (quotaResult && quotaResult.error === undefined ? quotaResult.quota : null);
  // A quota check that failed only matters when it says new ideas are off.
  const quotaFailure =
    quotaResult?.error !== undefined && (quotaResult.code === 'not_configured' || quotaResult.code === 'resting')
      ? { code: quotaResult.code }
      : null;
  const notice = quotaNotice({
    offline,
    quota,
    failure: (data?.failure ?? quotaFailure) as { code: 'not_configured' | 'resting' | 'rate_limited' | 'upstream' } | null,
  });

  const emptyPantry = enabled && pantryReady && !hasNames && search === null;
  return {
    ideas,
    emptyPantry,
    // Also true while the pantry itself is still loading.
    isLoading: enabled && !emptyPantry && ideasQuery.data === undefined && !ideasQuery.isError,
    isError: ideasQuery.isError && ideasQuery.data === undefined,
    localFailed: data?.localFailed ?? false,
    notice,
    refetch: async () => {
      await Promise.all([ideasQuery.refetch(), quotaQuery.refetch()]);
    },
  };
}
