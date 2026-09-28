# Where we left off (paused 2026-09-28)

## Done
- **Phase 1**, working end to end: sign-in, households, invites, members, live updates (commit `0a73286` on `main`).
- **Phase 2 database**: `supabase/migrations/20260928000200_pantry.sql`, with 19 PGlite tests passing (`npm run test:db`).
  **Not yet applied in Supabase.** Paste it into the SQL Editor and run it once.
- **Categories + Spoonacular + Activity tab**: finished. `src/lib/spoonacular/`, `src/features/pantry/resolve*.ts`, `src/features/activity/`.
- **Units**: finished and tested (`src/lib/units/`).

## In progress (branch `phase-2-pantry`)
- **Text parser** (`src/lib/ingredients/parse-line.ts`): implemented. `parse-line.test.ts` still needs writing.
- **Pantry screens** (`src/features/pantry/`): the helper modules and their tests are done (merge, group, dates, review, autocomplete). `queries.ts` and `actions.ts` were started. Still to do: pantry list components, the Add food sheet with autocomplete, the `/pantry/add` bulk page, the edit sheet, and replacing `src/app/(app)/pantry/page.tsx`.
- **Ingredient library** (`src/lib/ingredients/catalog.ts`, `aisles.ts`): not started, still placeholders. The source data is in `data/spoonacular/`.

State at pause: tsc clean, eslint clean, 362 unit tests passing (`npm test`).

## Next
1. You: run the pantry migration in Supabase. Add `SPOONACULAR_API_KEY` to `.env.local`. Run `npx vercel@latest login` if you want it deployed.
2. Me: finish the library, parser tests and pantry screens. Integrate, test in the browser, then merge to `main`.
3. Then: shopping-list database (Phase 4 groundwork), and deploy to Vercel (confirm first).
