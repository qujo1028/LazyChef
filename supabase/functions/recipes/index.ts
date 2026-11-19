// The `recipes` Edge Function: Spoonacular for the mobile app, with the key and the shared
// hourly cache kept server-side. See README.md and handler.ts.
//
// Secrets: SPOONACULAR_API_KEY (set with `supabase secrets set`). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { layered, memoryStore, type CacheStore } from "./cache.ts"
import { authenticate, serviceClient, supabaseStore } from "./db.ts"
import { createHandler } from "./handler.ts"
import { createSpoonacular, type Spoonacular } from "./spoonacular.ts"

const log = (message: string) => console.warn(message)

const url = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
const spoonacularKey = Deno.env.get("SPOONACULAR_API_KEY")?.trim() ?? ""

// Per isolate: the Spoonacular guards (402/429 back-off, 2 at a time) and the memory backup.
const spoonacular: Spoonacular | null = spoonacularKey ? createSpoonacular(spoonacularKey) : null
const store: CacheStore | null =
  url && serviceKey ? layered(supabaseStore(serviceClient(url, serviceKey), log), memoryStore()) : null

if (!spoonacular) log("[recipes] SPOONACULAR_API_KEY isn't set: answering not_configured.")
if (!url || !anonKey) log("[recipes] SUPABASE_URL or SUPABASE_ANON_KEY is missing.")

const handle = createHandler({
  spoonacular,
  store,
  log,
  async authenticate(token) {
    if (!url || !anonKey) throw new Error("Supabase isn't configured")
    return await authenticate(url, anonKey, token)
  },
})

Deno.serve(handle)
