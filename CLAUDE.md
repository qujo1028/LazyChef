@AGENTS.md

# LazyChef

Shared-household pantry tracker + recipe finder. Next.js 16 (App Router, `src/proxy.ts` instead of
middleware), React 19, Tailwind v4 + shadcn/ui (radix, "nova"; buttons/inputs enlarged for touch),
Supabase, Spoonacular (Phase 2+).

## Commands
- `npm run typecheck`, `npm run lint`, `npm run build`
- `npm run test:db`: applies `supabase/migrations/*.sql` to PGlite with Supabase stand-ins
  (`supabase/tests/harness.mjs`) and runs `*.test.mjs`. Add a test file for each migration's RLS rules.

## Conventions
- Every household-scoped table has `household_id` and RLS via `private.is_member(household_id)`.
  Multi-step or privileged writes go through `security definer` functions in `public` with
  `set search_path = ''`, EXECUTE revoked from `anon`/`public`, and `auth.uid()` checks.
- Realtime: add `private.broadcast_household_change('<household id column>')` triggers to new tables;
  clients listen on the private `household:<id>` channel.
- `src/types/database.ts` mirrors the migrations. Update it with each migration (or regenerate).
- Server actions re-check auth (`requireViewer()`); the proxy is not the only gate.
- Spoonacular free tier: 50 points/day, parse = 1 point per ingredient, cache ≤ 1 hour. Keep keys server-only.
