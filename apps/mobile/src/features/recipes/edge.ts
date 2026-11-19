// Calls the `recipes` Edge Function (Spoonacular, server-side). See
// packages/core/src/recipes/edge-contract.ts for the contract. Never throws: transport
// problems come back as an EdgeFailure, and a function that isn't deployed yet reads as
// "not_configured", so screens fall back to the local recipe library.
import { onlineManager } from '@tanstack/react-query';
import {
  RECIPES_FUNCTION,
  type EdgeFailure,
  type EdgeRequest,
  type InfoResponse,
  type QuotaResponse,
  type SuggestResponse,
} from '@lazychef/core/recipes/edge-contract';

import { supabase } from '@/lib/supabase';

type ResponseFor<R extends EdgeRequest> = R extends { action: 'suggest' }
  ? SuggestResponse
  : R extends { action: 'info' }
    ? InfoResponse
    : QuotaResponse;

const NOT_SET_UP: EdgeFailure = { error: "Recipe ideas from Spoonacular aren't set up yet.", code: 'not_configured' };

export async function callRecipes<R extends EdgeRequest>(request: R): Promise<ResponseFor<R>> {
  if (!onlineManager.isOnline()) {
    return { error: "You're offline. Showing what's saved on this phone.", code: 'upstream' } as ResponseFor<R>;
  }
  try {
    const { data, error } = await supabase.functions.invoke(RECIPES_FUNCTION, { body: request });
    if (error) {
      // FunctionsHttpError carries the function's own JSON body (our EdgeFailure) in error.context.
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        if (context.status === 404) return NOT_SET_UP as ResponseFor<R>;
        try {
          const body = (await context.json()) as Partial<EdgeFailure>;
          if (body && typeof body.error === 'string' && typeof body.code === 'string') return body as ResponseFor<R>;
        } catch {
          // Not JSON: fall through.
        }
      }
      return { error: "Couldn't reach recipe ideas. Try again in a bit.", code: 'upstream' } as ResponseFor<R>;
    }
    return data as ResponseFor<R>;
  } catch {
    return { error: "Couldn't reach recipe ideas. Try again in a bit.", code: 'upstream' } as ResponseFor<R>;
  }
}
