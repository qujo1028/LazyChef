# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# LazyChef

Shared-household pantry tracker, shopping list and recipe finder. Mobile-first. Next.js 16 (App Router,
`src/proxy.ts` instead of middleware), React 19, Tailwind v4 + shadcn/ui (radix, "nova"; buttons/inputs
enlarged for touch), Supabase (auth, Postgres + RLS, realtime), Spoonacular, Groq for AI, RevenueCat for Pro.
iOS/Android apps in `ios/` and `android/` are Capacitor shells that load the live site, so a web deploy
updates them too. README.md has setup, env vars, and the Pro/admin/TheMealDB runbooks.

## Commands
- `npm run dev` (port 3000), `npm run build`, `npm run typecheck`, `npm run lint`
- `npm test`: Vitest, `src/**/*.test.ts` (pure logic only). One file: `npx vitest run src/features/recipes/taste.test.ts`;
  one test: add `-t "name"`.
- `npm run test:db`: applies `supabase/migrations/*.sql` in filename order to PGlite with Supabase stand-ins
  (`supabase/tests/harness.mjs`: roles, `auth.uid()`, realtime, storage) and runs `supabase/tests/*.test.mjs`.
  One file: `node --test supabase/tests/ai-free-allowance.test.mjs`. Add a test file for each migration's RLS rules.
- CI (`.github/workflows/ci.yml`) also runs `npm audit --omit=dev --audit-level=high` and
  `npm run ingredients -- --check` (the generated ingredient library must be up to date).
- `npm run db:types` regenerates `src/types/database.ts` from the live schema.

## Architecture
- `src/app/`: routes only. `(auth)` sign-in pages, `(app)` tab-bar pages for household members, `api/` for
  the RevenueCat webhook and admin cron. Logic lives in `src/features/<domain>/` (`actions.ts` server actions,
  `queries.ts` reads, `components/`, and pure `*-core.ts` / helper modules that carry the unit tests).
- Supabase clients (`src/lib/supabase/`): `server.ts`/`client.ts` act as the signed-in user (RLS applies).
  `service.ts` (`getServerDb`) uses the secret key for server-only tables (Spoonacular cache/usage,
  subscriptions, webhook log); `admin.ts` is for auth admin (account deletion). Both return null without the key
  and must never touch household data on a user's behalf or be imported client-side.
- Auth: `requireViewer()` (`src/features/household/queries.ts`) in every server action; the proxy is not the only
  gate. Client components call actions through `src/lib/call-action.ts`.
- Realtime: triggers broadcast row changes to the private `household:<id>` channel; pantry and list keep client
  state with `src/lib/row-state.ts` (newest row wins, deleted ids stay deleted).
- Multi-row changes are single Postgres functions (`add_pantry_items`, `complete_shopping_trip`, `cook_recipe`)
  so each is one activity-feed entry.
- Recipes: local library first (TheMealDB imports + household recipes, matched in SQL by `match_local_recipes`,
  ranked in `local-match.ts` with household thumbs ratings from `taste.ts`); Spoonacular only tops up when fewer
  than 10 local ideas come back. Spoonacular code is server-only in `src/lib/spoonacular/` (costs in `cost.ts`),
  cached ≤ 1 hour via `src/features/recipes/cache.ts`, with daily points tracked in `spoonacular_usage`.
- AI: every call goes through `askAiJson` (`src/lib/llm/ai.ts`): checks `GROQ_API_KEY`, the per-person hourly
  `ai` rate limit, and validates JSON with zod. User text goes in a user message, never the system prompt.
  Recipe AI (meal ideas, "Ask AI for an idea", substitutions) also calls `takeAiAllowance()`
  (`src/features/pro/ai-allowance.ts`): free households get 10 uses per rolling 7 days, Pro is uncounted.
  Call it after cache hits and refusals so those cost nothing. The client asks per-device consent first
  (`useAiConsent` in `src/components/ai/ai-consent.tsx`); the server never sends pantry data to the AI unprompted.
- Pro: one subscription covers the household (`private.household_is_pro()`, `get_pro_status()`); features and
  paywall copy in `src/features/pro/plans.ts`.
- Rate limits live in Postgres (`private.rate_limit_rule()`, `take_rate_limit`), called via `src/lib/rate-limit.ts`.
- `next.config.ts` sets a strict CSP. A new image host or browser-called API must be added there.

## Conventions
- Every household-scoped table has `household_id` and RLS via `private.is_member(household_id)`.
  Multi-step or privileged writes go through `security definer` functions in `public` with
  `set search_path = ''`, EXECUTE revoked from `anon`/`public`, and `auth.uid()` checks.
- Realtime: add `private.broadcast_household_change('<household id column>')` triggers to new tables;
  clients listen on the private `household:<id>` channel.
- `src/types/database.ts` mirrors the migrations. Update it with each migration (or regenerate).
- Migrations applied through the Supabase MCP get a new timestamp version; rename the file to match so the repo
  and `list_migrations` agree.
- `.env.local` points at the live Supabase project. Don't write test data there without asking.
- Spoonacular free tier: 50 points/day, parse = 1 point per ingredient, cache ≤ 1 hour. Keep keys server-only.
- The repo is public: never commit `.env.local` or keys.

## Parallel work
- Before planning or briefing parallel sessions, run `git fetch origin` and base every worktree on `origin/main`, never a stale local `main`. Check whether a feature already exists there first.
- Only one branch at a time may change `supabase/migrations/` or `src/types/database.ts`. Other sessions stay out of those files until that branch is merged.
- Split work by feature, not by layer. Each worker session owns one whole feature.
- Workers commit to their own branch. They never push to `main` and never open PRs; the lead session does that.
- Before reporting done, a worker runs `npm run typecheck && npm run lint && npm run test` (plus `npm run test:db` if it touched the DB).
- The lead session reviews each branch (`/code-review`), fetches and merges `origin/main` into it, reruns all checks, then opens a PR. Pushes to `main` auto-deploy to Vercel, so the user merges the PR.
- Keep to 2-3 workers at once. Use subagents for research or diff review inside a session.
