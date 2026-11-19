// Calls the `ai` Edge Function (Groq, server-side). See packages/core/src/ai/edge-contract.ts
// for the contract. Never throws: transport problems come back as an AiFailure, and a function
// that isn't deployed yet reads as "not_configured", so the Ideas sheet says AI isn't set up.
import { onlineManager } from '@tanstack/react-query';
import {
  AI_FUNCTION,
  type AiFailure,
  type AiRequest,
  type AllowanceResponse,
  type IdeasResponse,
} from '@lazychef/core/ai/edge-contract';

import { supabase } from '@/lib/supabase';

type ResponseFor<R extends AiRequest> = R extends { action: 'ideas' } ? IdeasResponse : AllowanceResponse;

const NOT_SET_UP: AiFailure = { error: "AI ideas aren't set up yet.", code: 'not_configured' };
const UNREACHABLE: AiFailure = { error: "Couldn't reach AI ideas. Try again in a bit.", code: 'upstream' };

export async function callAi<R extends AiRequest>(request: R): Promise<ResponseFor<R>> {
  if (!onlineManager.isOnline()) {
    return { error: "You're offline. AI ideas need a connection.", code: 'upstream' } as ResponseFor<R>;
  }
  try {
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body: request });
    if (error) {
      // FunctionsHttpError carries the function's own JSON body (our AiFailure) in error.context.
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        if (context.status === 404) return NOT_SET_UP as ResponseFor<R>;
        try {
          const body = (await context.json()) as Partial<AiFailure>;
          if (body && typeof body.error === 'string' && typeof body.code === 'string') return body as ResponseFor<R>;
        } catch {
          // Not JSON: fall through.
        }
      }
      return UNREACHABLE as ResponseFor<R>;
    }
    if (!data || typeof data !== 'object') return UNREACHABLE as ResponseFor<R>;
    return data as ResponseFor<R>;
  } catch {
    return UNREACHABLE as ResponseFor<R>;
  }
}
