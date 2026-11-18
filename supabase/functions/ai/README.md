# `ai` Edge Function

Recipe ideas for the mobile app's Ideas sheet. The app never holds the Groq key: it calls this
function with the signed-in person's Supabase session and sends only the meal and an optional
hint. The function reads the pantry, the person's diet and the household's thumbs itself, as
that person (RLS), asks Groq for three ideas, checks them, and returns them with the free
weekly allowance.

The contract is `packages/core/src/ai/edge-contract.ts` (the app calls it through
`apps/mobile/src/features/ideas/ai-edge.ts`). It's a port of the web's `getMealIdeas`
(`src/features/recipes/ai-idea/meal-actions.ts`), and the prompt, reply checks and cache key are
the same code (`packages/core/src/recipes/ai/`).

| Action      | Body                                   | What it does |
|-------------|----------------------------------------|--------------|
| `ideas`     | `householdId`, `meal`, `hint?`         | Up to 3 ideas for the meal from the pantry, each with `missing` (names to buy). `cached: true` when it came from the hourly cache (free). Takes one free use on a cache miss. |
| `allowance` | `householdId`                          | The allowance only (`pro`, `used` in the last 7 days, `limit`, `resetsAt`). Takes nothing. |

Every success carries `allowance`. So do `limit_reached`, `rate_limited` and model failures after
a use was taken, so the app's count line stays right.

## Rules it enforces

- **Auth:** a valid Supabase access token (`Authorization: Bearer <jwt>`), checked with
  `auth.getUser()`, then membership of `householdId` (read from `household_members` as them).
- **Only one client, the caller's.** Pantry, preferences, ratings, the idea cache
  (`ai_idea_cache`, `put_ai_idea_cache`), `take_ai_allowance`, `get_pro_status`, `ai_usage` and
  `take_rate_limit('ai')` all run with the person's token. There is no service role key here.
- **Order (as on the web):** validate, auth, membership, read the pantry (nothing to cook from is
  `empty_pantry`), cache lookup (a hit is free), `take_ai_allowance` (refused is
  `limit_reached`), `take_rate_limit('ai')` (refused is `rate_limited`), then Groq.
- **Fails closed:** if any check errors (auth, membership, pantry, preferences, allowance, rate
  limit), the answer is `upstream` and the model is never called. The web's `takeAiAllowance`
  lets the call through on an error; this doesn't. Taste hints are optional context: if they
  can't be read the ideas come without them. A failed cache read counts as a miss.
- **One use per request:** the model gets a second try when its answer can't be used (bad JSON,
  or every idea broke the diet), but the allowance and the rate limit are taken once.
- **Prompt injection:** the system prompt is fixed. Pantry names, the diet, taste titles and the
  hint go in the user message, each quoted with `JSON.stringify`, and the rules tell the model to
  treat them as data and ignore a hint that isn't about cooking. The hint is cleaned first
  (control, zero-width and direction characters out, whitespace collapsed) and capped at
  `AI_MAX_HINT_LENGTH` (100).
- **Checked answers:** the reply is parsed with the same zod schemas as the web, ideas that break
  the diet or allergies (`breaksDiet`) are dropped, and `fromPantry` is re-checked against the
  real pantry before `missing` is worked out. Pantry items that break the person's diet are never
  sent to the model.
- **Cache:** `ai_idea_cache`, per household, for an hour. Any member can write that table, so a
  cached answer is re-checked with the caller's diet and pantry when read. Without a hint the key
  is byte for byte the web's, so the web and the phone share answers. A hint is part of the key
  (lowercased, single-spaced) rather than skipping the cache, so asking "quick" twice within the
  hour is free and a hint never gets another hint's ideas.
- **Logs:** codes only. Never the pantry, the hint, the model's reply or a token.
- **Inputs:** everything is validated (`validate.ts`). Bodies are read only after the token checks
  out, and never past 4 KB.

Status codes: 200 success, 200 `empty_pantry`, 400 `bad_request`, 401 `unauthorized`,
403 `unauthorized` (not a member), 405 for non-POST, 429 `limit_reached` and `rate_limited`,
502 `upstream` (Groq or our database failed, or no idea fit), 503 `not_configured`.

## Files

- `index.ts`, `db.ts`: Deno only (`Deno.serve`, the Supabase client). Checked with `deno check index.ts`.
- `handler.ts`, `validate.ts`, `groq.ts`: plain TypeScript with everything injected, tested with
  Vitest (`npm test`) and type-checked by `npm run typecheck`.
- `../_shared/http.ts`: CORS, JSON responses, the bearer token and the capped body reader (shared with `recipes`).
- `../_shared/core/*`: generated copies of the pure `packages/core` modules this uses. After
  changing a source, run `node scripts/sync-edge-shared.mjs`; a test fails while a copy is stale.
- `deno.json`: the import map (`@supabase/supabase-js`, and `zod` for the shared schemas).

## Secrets

- `GROQ_API_KEY`: required. Without it every call answers 503 `not_configured` and the Ideas
  sheet says AI isn't set up. Use the same key as the web (Vercel), or a new one from
  https://console.groq.com/keys.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: provided by Supabase.

Set the key in the Supabase dashboard (Project settings, Edge Functions, Secrets, Add secret),
so it never goes through a shell history or a chat. Or from a gitignored file in your own
terminal:

```sh
# supabase/functions/.env is gitignored (.env*). Put GROQ_API_KEY=... in it.
npx supabase secrets set --env-file supabase/functions/.env --project-ref gldppemwlecnbarxamcb
```

## Deploy

```sh
npx supabase functions deploy ai --project-ref gldppemwlecnbarxamcb   # keeps JWT verification on
```

No migration is needed: it uses `household_members`, `pantry_items`, `user_preferences`,
`recipe_ratings`, `recipes`, `saved_recipes`, `activity_log`, `ai_idea_cache`, `ai_usage`,
`put_ai_idea_cache`, `take_ai_allowance`, `get_pro_status` and `take_rate_limit`, which
production already has.

## Smoke test

Without a session (no key needed, safe against production):

```sh
URL=https://gldppemwlecnbarxamcb.supabase.co/functions/v1/ai
ANON=<publishable key>

curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$URL"            # 204
curl -s "$URL" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"action":"allowance","householdId":"00000000-0000-4000-8000-000000000000"}'   # 401
```

With a session, from the app (the Ideas sheet), or with curl and a token of your own test
account (`supabase start` locally, never a real person's account):

```sh
TOKEN=<access token>
HOUSEHOLD=<your household id>

curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"action\":\"allowance\",\"householdId\":\"$HOUSEHOLD\"}"

# Takes one free use (unless cached or Pro).
curl -s "$URL" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"action\":\"ideas\",\"householdId\":\"$HOUSEHOLD\",\"meal\":\"main course\",\"hint\":\"quick\"}"
```

Running the same `ideas` call again within the hour should come back with `"cached": true` and
the same `allowance.used`.
