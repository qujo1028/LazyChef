# `recipes` Edge Function

Spoonacular for the mobile app. The app never holds the Spoonacular key: it calls this function
with the signed-in person's Supabase session, and the function checks who they are, asks
Spoonacular (or the shared cache), and returns small, validated recipe shapes.

The contract is `packages/core/src/recipes/edge-contract.ts` (the app calls it through
`apps/mobile/src/features/recipes/edge.ts`). Actions:

| Action    | Body                                          | What it does |
|-----------|-----------------------------------------------|--------------|
| `suggest` | `householdId`, `names` (up to 60), `filters`  | Pantry ideas. No filters: `findByIngredients` (40 results). Any of `type`, `maxTime`, `query`: `complexSearch` (20 results). `type: "lunch"` becomes a main course of at most 30 minutes, as on the web. |
| `info`    | `householdId`, `ids` (up to 20)               | Full recipes. Cached ones are free; the rest come from one `informationBulk` call. Recipes that can't be loaded right now are left out; the failure is returned only when nothing can be shown. |
| `quota`   | none                                          | Today's points, the reset time (midnight UTC) and whether searches are resting. |

Every success and every `resting` answer carries `quota`.

## Rules it enforces

- **Auth:** a valid Supabase access token (`Authorization: Bearer <jwt>`), checked with
  `auth.getUser()`. For `suggest` and `info`, the person must be a member of `householdId`
  (read from `household_members` as them, so RLS applies).
- **Rate limits:** `take_rate_limit('recipe_search')` once per search that misses the cache, and
  `take_rate_limit('recipe_open')` once per uncached recipe in `info` (stricter than the web,
  which takes one per bulk call, because the app can send any ids). Called as the person. If the
  check itself fails, the request fails (no Spoonacular call).
- **Daily points (free plan, 50 a day):** the shared `spoonacular_usage` row (written through
  `record_spoonacular_usage`, from the `X-API-Quota-*` headers, or our cost estimate when they're
  missing). Searches stop 3 points short of the limit, recipe details 1 point short. After a 402
  everything rests until midnight UTC.
- **Cache:** the shared `spoonacular_cache` (one hour at most, Spoonacular's terms), with the same
  keys as the web app, so the web and the phone share results. Cache hits cost nothing and work
  while resting. Only public recipe data is cached, never household data.
- **Keys:** the service role key is used only for `spoonacular_cache` and `spoonacular_usage`, as
  the web's `getServerDb` does. The Spoonacular key only goes in the `x-api-key` header. Neither
  is ever returned or logged.
- **Inputs:** everything is validated (`validate.ts`). Anything that doesn't fit is a 400. Bodies
  are read only after the token checks out, and never past 16 KB.
- **No cache poisoning:** names become their normalized keys ("Fresh Tomatoes" is "tomato") and the
  search words are lowercased before Spoonacular sees them, so what's stored under a cache key is
  exactly what any request with that key would have fetched.
- **Known gap:** the per-person limits still let one account (or a few) use up the shared 50 daily
  points in about an hour. A per-household or global bucket would need a migration (a new
  `rate_limit_rule` entry and the `take_rate_limit` allowlist).

Status codes: 200 success, 200 `resting` (cached results still come back), 400 `bad_request`,
401 `unauthorized`, 403 `unauthorized` (not a member), 405 for non-POST, 429 `rate_limited`,
502 `upstream` (Spoonacular, or our database, failed), 503 `not_configured`.

The app must show the "Powered by spoonacular" credit with a link back wherever these recipes appear.

## Files

- `index.ts`, `db.ts`: Deno only (`Deno.serve`, Supabase clients). Checked with `deno check index.ts`.
- `handler.ts`, `validate.ts`, `cache.ts`, `spoonacular.ts`: plain TypeScript with everything injected,
  tested with Vitest (`npm test`) and type-checked by `npm run typecheck`.
- `../_shared/core/*`: generated copies of the pure `packages/core` and web modules this uses (the
  Supabase bundler resolves files under `supabase/functions`, and Deno needs `.ts` import paths).
  After changing a source, run `node scripts/sync-edge-shared.mjs`; a test fails while a copy is stale.

## Secrets

- `SPOONACULAR_API_KEY`: required. Without it every call answers 503 `not_configured` and the app
  falls back to its local recipe library.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: provided by Supabase.

Set the key from a file so it never lands in a shell history or a chat:

```sh
# supabase/functions/.env is gitignored (.env*). Put SPOONACULAR_API_KEY=... in it.
supabase secrets set --env-file supabase/functions/.env
```

## Deploy

```sh
supabase login                       # in your own terminal
supabase link --project-ref <project-ref>
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy recipes    # keeps JWT verification on (the default)
```

No migration is needed: it uses `spoonacular_cache`, `spoonacular_usage`, `put_spoonacular_cache`,
`record_spoonacular_usage`, `take_rate_limit` and `household_members`, which production already has.

## Test locally

Needs Docker and the Supabase CLI.

```sh
supabase start                                         # local stack with every migration applied
supabase functions serve recipes --env-file supabase/functions/.env
```

Then, with a local user's access token (sign one in against the local stack, never production):

```sh
ANON=<local anon key from `supabase status`>
TOKEN=$(curl -s 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"cook@example.com","password":"local-test-password"}' | jq -r .access_token)

curl -s http://127.0.0.1:54321/functions/v1/recipes \
  -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"action":"quota"}'

curl -s http://127.0.0.1:54321/functions/v1/recipes \
  -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"action":"suggest","householdId":"<your household id>","names":["eggs","spinach","rice"],"filters":{"type":null,"maxTime":null,"query":null}}'
```
