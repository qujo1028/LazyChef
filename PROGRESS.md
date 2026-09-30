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

## Paused again (2026-09-28, 09:50), waiting for the user to say "resume"
- Committed since the first pause: shopping list database (`0c3d1f6`), with 28 database tests passing.
- Uncommitted work from the stopped pantry-screens agent: `src/features/pantry/{display,item-form,pantry-state,staples,suggest}.ts` plus tests. These are UI helper modules; no components or pages yet.
- Ingredient library and parser tests: nothing was written before the stop.
- To resume, start fresh agents for (1) the ingredient library, (2) the parser tests, and (3) the pantry screens, continuing from the helper files above. The earlier briefs still apply.
- Still waiting on the user: run the pantry + shopping list SQL in Supabase, and `npx vercel@latest login`.

## Paused (2026-09-29, 01:45), waiting for the user to say "resume". This supersedes the notes above.
Done since the last pause:
- All 3 migrations are applied in Supabase (checked through the Supabase MCP, which is now connected to `gldppemwlecnbarxamcb`). The SQL Editor didn't record them in the migration history, so backfill that with the next migration (ask the user first).
- Parser tests: 804 tests, and 48 parser bugs fixed (`src/lib/ingredients/parse-line.test.ts`).
- Pantry screens: `/pantry` (floating "Add food", quick-add sheet with suggestions, edit sheet, "Used some", −1 with Undo, staples) and `/pantry/add` (bulk). Components are in `src/features/pantry/components/`.
- Ingredient library: 3,343 entries, `catalog.ts` and `aisles.ts` implemented, with 210 new tests. Rebuild with `npm run ingredients` (`-- --check` to verify). Drinks and household lists were skipped on purpose (the user's call).
- Vercel: the user is logged in (quinn2212). Project `lazychef` is created and linked (`.vercel/`). Env vars are set: the Supabase URL and publishable key (all envs) and the secret key (production and preview, sensitive). Not deployed yet.
- `.env.local` now has `SUPABASE_SECRET_KEY`. `SPOONACULAR_API_KEY` is still empty.
- Checks: `npm test` for the library and pantry has 1,124 passing. `npm run test:db` has 28 passing. tsc and eslint are clean.

To resume, restart these three review/fix agents (they had edited nothing yet when stopped):
1. Pantry logic (`src/features/pantry/*.ts`): autocomplete comma-in-"1,000" segmenting; the list marker dropped by `replaceCurrentName`; the `ParsedLine.raw` doc comment; skipping Spoonacular lookups for receipt header lines; then review `actions.ts` and `pantry-state.ts`.
2. Pantry UI (`components/**`, `app/(app)/pantry/**`): code review, then a read-only phone check at 375px. It was looking at a `router.replace` after an `await` that isn't wrapped in `startTransition`.
3. Deploy readiness (proxy, supabase, spoonacular, auth, layout/manifest, README): Spoonacular without a key, auth origins behind the Vercel proxy (`x-forwarded-host`), metadataBase, and a "Deploying to Vercel" section in the README.
Then: `npm test`, `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm run build`, a browser check, and a commit (ask). Then `npx vercel@latest deploy --prod` (confirmed by the user on 2026-09-29). After that the user sets the Supabase Site URL and Redirect URLs to the production domain.

## Deployed (2026-09-29)
- Production: https://lazychef-gamma.vercel.app (Vercel project `lazychef`, team `quinn2212-7879s-projects`; `vercel.json` sets the framework to nextjs). Deploy from commit `47739f4`.
- The user runs `npx vercel@latest deploy --prod`, because the auto-mode permission checker blocks Claude from running production deploys.
- User to do: in Supabase, under Authentication → URL Configuration, set Site URL to https://lazychef-gamma.vercel.app and add `https://lazychef-gamma.vercel.app/**` to Redirect URLs (keep localhost).

## Phase 3: recipe suggestions (2026-09-29, branch `claude/nice-shannon-yjvi7b`)
Built:
- Migration `20260929000100_recipes.sql`: `spoonacular_cache` (per household, max 1 hour, written only through
  `put_spoonacular_cache()`) and `spoonacular_usage` (one row per UTC day, written only through
  `record_spoonacular_usage()`). 7 new PGlite tests (35 total).
- `src/lib/spoonacular/recipes.ts` + `recipe-shapes.ts`: findByIngredients (no filters), complexSearch (meal type /
  cook time filters), recipe information.
- `src/features/recipes/`: have/need matching (`match.ts`: ids, normalized names, library entries, "brown rice"
  covers "rice", staples count, "ran out" doesn't), the shared cache with a daily-points guard (`cache.ts`, stops new
  searches under 3 points left), filters in the URL, and "add missing to the shopping list" (`actions.ts`, `list.ts`).
- Pages: `/recipes` (Make now, Almost there with 1 to 3 missing, filters) and `/recipes/[id]` (have/need checklist,
  add to list, steps, source link).
- The pantry's parseIngredients calls now record usage too.

Still to do:
- Done 2026-09-29: the user applied the migration in the SQL Editor, and all 4 migrations are now recorded in
  `supabase_migrations.schema_migrations`. `SPOONACULAR_API_KEY` is set in Vercel (production + preview). A redeploy
  put this branch on production before the PR merged, so merge it to keep `main` in sync.
- Browser check with a real account once the migration is live.
- Phase 4: the shopping list screen (recipe items already land in `shopping_list_items` with recipe id/title).

## Phase 4: the shared shopping list (2026-09-29, branch `claude/nice-shannon-yjvi7b`)
No database changes (the list migration was already live). Built:
- `/list`: lines grouped by aisle in store order, a count in the header, "In the cart" (who checked it), an empty
  state, `loading.tsx` and `error.tsx`.
- Quick add (`list-quick-add.tsx`): the pantry's parser + ingredient combobox; adds right away with Undo. Categories
  come from the household's fixes, then the ingredient library (no Spoonacular points). Repeats top up an unchecked
  line (`src/features/list/plan.ts`).
- Checking off: optimistic with Undo, live for housemates (`use-list.ts`, checked overrides in `list-state.ts`).
- Edit sheet: name, amount/unit, aisle, note; delete with Undo.
- Put away: the pantry's review cards with expiry dates and "Adds to your …" hints (`put-away.ts`, `planAdditions`
  now returns per-line `outcomes`), then `complete_shopping_trip`. ✕ on a card clears it without adding it;
  "Clear without adding" clears everything checked.
- Pantry: "Add to shopping list" in the edit sheet and on "Ran out" rows, plus an action on the "Moved to Ran out" toast.
- Recipes: "Add missing to list" now goes through the same planner, so it tops up instead of skipping.
- Refactors: the pantry's list state now sits on a generic `src/lib/row-state.ts`; pantry zod schemas and
  `dbError`/`saveCategoryOverrides` moved to `schemas.ts` / `server-helpers.ts` so the list reuses them.

Checked in a browser at 375px with two throwaway accounts in their own test household (all deleted afterwards).
Add, top-up, check/undo, edit, delete, put away (4 lb chicken in the pantry after topping up 1 lb), and ran out →
list → clear without adding all worked, with no horizontal scroll. Live sync couldn't be checked here: the
sandbox's browser can't open the Supabase Realtime websocket. It uses the same channel as the pantry, so check it on
two phones after deploy.

## Phase 5: cook mode and polish (2026-09-30, branch `claude/nice-shannon-yjvi7b`)
Built:
- **I cooked this** (recipe page): `cook-plan.ts` matches each ingredient to a pantry item (Spoonacular id, then
  name via the ingredient library) and converts the amount to the item's unit. It says "check this" when units
  don't convert (clove vs head, cups vs lb, servings). The review sheet (`cook-sheet.tsx`) lets you edit
  amounts and skip lines. Staples are just listed. Confirming calls `cook_recipe()`, which takes everything out
  in one transaction. Afterwards: a toast with Undo, a done screen with "Add to list" for anything that ran out,
  and the Activity feed shows "X cooked Recipe" with the amounts.
- **Migration `20260930000100_cook_mode.sql`** (applied to the live DB 2026-09-29 via the Supabase connector): the `cooked` activity
  action, `cook_recipe()` (security invoker, clamps at 0, one batch, recipe in `details`), the activity trigger
  logging "cooked" inside it, and `add_pantry_items` accepting `{"merge_into", "untrack": true}`. 6 new PGlite
  tests (`supabase/tests/cook.test.mjs`), 41 total.
- **Known gaps fixed**: typing "eggs" with no amount after eggs ran out reuses that row as untracked (needs the
  migration). "−1" / "Used some" now return the full row, so a stale server render can't win. Every section has
  `error.tsx` (shared `SectionError`) and `loading.tsx`. `callAction` moved to `src/lib/call-action.ts` and now
  wraps every action call, including household, invites, auth forms (`withConnectionErrors`), sign out and Google.
- **Polish**: every screen checked at 320 and 375 px in light and dark with an automated audit (overflow,
  unlabeled controls, tap targets under 44 px, inputs under 16 px). Fixed: Button default and icon sizes are now
  44 px, plus the header links, recipe filter chips, checklist hit areas, "Forgot it?", and a household button
  that overflowed at 320 px. Empty states and loading skeletons were checked too.
- **Performance**: the recipe page was shipping the 179 KB ingredient library. Planning now happens on the
  server (`cook-plan.ts`), so no page loads the library up front (the add-food box still lazy-loads it).
  I couldn't open the Vercel Speed Insights dashboard from here (no Vercel token), so real-user numbers still
  need a look.

Tested end to end with a throwaway household on the live DB: deduct, ran-out "Add to list", Undo, and the
"You cooked Korean Candy Chicken" feed entry all work.

To do:
- Check live sync on two phones (the sandbox browser can't open the Realtime websocket).

## Phase 6: saved recipes and stats (2026-09-29, branch `claude/nice-shannon-yjvi7b`)
Built:
- **Migration `20261001000100_saved_recipes.sql`** (applied to the live DB 2026-09-29 via the Supabase connector):
  `saved_recipes` (household id, recipe id and title only, per Spoonacular's terms; RLS by membership;
  `saved_by` stamped by a trigger; broadcast), and the `shopped` activity action: `complete_shopping_trip()`
  now marks its pantry changes so a trip is logged as one "bought N items" entry, untracked items included.
  Trips from before the migration stay as added/restocked. 6 new PGlite tests (`saved.test.mjs`), 47 total.
- **Saved** (`/recipes/saved`, an "Ideas | Saved" toggle on Recipes): a heart on every recipe card and recipe
  page, shared by the household. Each saved recipe shows "Can make now" or "Have 5 of 7. Need …" against the
  current pantry, and "Cooked 3 times · last Sep 12" from the activity log. Sort by ready to cook, newest or
  most cooked. Ingredients come from the hourly cache; anything missing is fetched in one `informationBulk`
  call (1 point + 0.5 per extra recipe) and cached per recipe, so opening one is free. When points run out
  the list still shows, without the match.
- **"Loved it? Save it"** on the "I cooked this" done screen when the recipe isn't saved yet.
- **Stats** (`/activity/stats`, a "Feed | Stats" toggle on Activity): meals this month vs last, cooking streak,
  trips and items bought this month, a 12-week meals chart (plain CSS bars), most cooked recipes (link to the
  recipe), each housemate's meals / trips / items, and most bought items with an "add to list" button. It's
  computed in the browser (`stats.ts`, unit-tested) so days and weeks follow the viewer's time zone.

Known limits:
- Undoing a cook doesn't take it back out of the stats or the cook history.
- Saved and Stats don't update live; they refresh on navigation or after an action.

Tested with a throwaway household on the live DB (then deleted): saving from cards, the recipe page and
the cook done screen, unsaving, the Saved match and cook history, a trip logged as "bought 3 items", every
Stats section, and "add to list" from Most bought. No overflow or small tap targets at 320/375 px, light and dark.

## Shared server-only Spoonacular cache (2026-09-30, from branch `recipes`, merged onto main)
Brought over from the `recipes` branch. main already had recipes, cook mode, saved recipes and ingredient
emoji, so only the parts that improve on it came across:
- **Migration `20261002000100_spoonacular_server_cache.sql`** (not applied yet, ask first): `spoonacular_cache`
  is now one table for every household, keyed by `cache_key`, max 1 hour, closed to anon/authenticated (RLS on,
  no policies, no grants). Only the server reads and writes it, with `SUPABASE_SECRET_KEY` (service_role).
  `spoonacular_usage` is server-only too, gains `exhausted_at` (set on a 402), and
  `record_spoonacular_usage()` adds our cost estimate when quota headers are missing.
  `purge_spoonacular_cache()` deletes expired rows (and usage older than 30 days) on every cache write.
- `src/lib/spoonacular/cost.ts`: point costs for every endpoint, plus the UTC reset time (tested).
- `src/features/recipes/cache-core.ts`: cache keys (sorted normalized pantry names + filters, so households
  with the same food share results), the daily guard (3 points kept back for searches, 1 for opening a
  recipe), 402 → "resting until tomorrow", and an in-memory store for when the secret key isn't set.
  `cache.ts` wires it to Supabase with the in-memory store as backup.
- The Saved tab's `cachedRecipeDetails` now uses the shared store (`getMany`, one `informationBulk`, `put` per
  recipe) with the same guard, so a saved recipe someone else opened in the last hour is free.
- Matching: salt and pepper (all spellings) never count as missing, like water. Bell peppers still do.
- complexSearch (filters) asks for 20 results instead of 40 (2.2 points instead of 4.4).
- "Resting until tomorrow" states on `/recipes` and `/recipes/[id]`, a "Powered by Spoonacular" credit, and
  recipe source links fall back to Spoonacular's page.
- Left out (main already does these): the branch's Make now / Almost there tabs, the You need / You have
  checklist split, and "Missing:" chips on cards.

Deploy note: apply the migration right around when this reaches production. Code already on main can't
read or write the new cache (it logs errors and runs without the cache or the points guard), and the new
code falls back to an in-memory cache until the migration is there.

## Security hardening (2026-09-30, branch `claude/keen-gates-txlzvs`)
- Headers (`next.config.ts`): Content-Security-Policy (enforced; `'unsafe-inline'` scripts because nonces
  would force every page to render per request), HSTS (2 years), Permissions-Policy. Checked in a
  browser on `/login`, `/signup`, `/forgot-password` with a production build: no CSP violations.
- **Migration `20261003000100_security_hardening.sql`** (not applied yet, ask first):
  - `private.rate_limits` + `public.take_rate_limit(bucket)`: per person, fixed windows, limits in SQL
    (recipe_search 15/h, recipe_open 40/h, ingredient_lookup 20/h). Checked only when points would be spent.
  - Wrong invite codes: 10 per 15 minutes per person, counted inside `get_invite_preview()` and
    `join_household()`. `join_household()` now returns null for a wrong code instead of raising.
  - `profiles.avatar_url`: https only (trigger clears anything else; NOT VALID check as a backstop).
  - 6 PGlite tests (`supabase/tests/security.test.mjs`).
- The app fails open if the rate-limit check errors (e.g. before the migration is applied); the daily
  points guard still applies.

Still to do from the security plan: leaked-password protection and password length in Supabase Auth,
Supabase security advisor, Dependabot/CodeQL, rotating any exposed keys, and an incident checklist.
## Phase 7: barcode scanning (2026-09-30, branch `claude/nice-shannon-yjvi7b`)
Built:
- **Migration `20261004000100_household_barcodes.sql`** (applied to the live DB 2026-09-30 via the Supabase connector; renumbered after `security_hardening` took 20261003000100): `household_barcodes`
  (household, code, name, one package's quantity + unit, saved_by stamped by a trigger). Members only (RLS);
  anon has no access. 5 PGlite tests (`supabase/tests/barcodes.test.mjs`), 54 total.
- **Scanner** (`src/features/barcodes/components/barcode-scanner.tsx`): full-height sheet, the camera pinned
  at the top, a "type the code" box, and the scan list below. The phone's own BarcodeDetector when it reads
  grocery codes (Chrome on Android), otherwise ZXing in WebAssembly (iPhone Safari), loaded only when the
  scanner opens, from our own site: `scripts/copy-zxing-wasm.mjs` copies it to `public/vendor/zxing/` before
  `dev`/`build` (gitignored, versioned file name, cached for a year; the proxy skips `/vendor/`). The same
  code again within 2.5 s is ignored, so a carton held in view counts once. Flashlight toggle when the
  camera has one; clear messages when the camera is blocked or missing.
- **Lookup** (`lookupBarcode`): the household's remembered name first, then Open Food Facts (free, no key, no
  Spoonacular points; credited in the scanner). `src/lib/barcode/product.ts` turns a product into a pantry
  line: the ingredient library's name only when its words (and the product's last word) are in the product
  name ("Kirkland Signature Large Brown Eggs" → eggs, but "Zesty Ranch Crunchers" isn't ranch dressing), the
  brand and printed size stripped, the package size parsed ("18 oz (510 g)", "400 g ℮", "2 x 200 g").
  Codes are validated (check digit) and UPC-A / UPC-E / GTIN-14 normalized to one 13-digit form.
- **Pantry**: "Scan barcodes" on Add groceries and in the quick add sheet (`/pantry/add?scan=1`). Scans become
  lines ("24 eggs") in the box and go straight to the usual review. On Add, each scanned item's barcode is
  remembered under the name it was added as (one package's amount, not two cartons' worth). Unknown products
  can be named by hand.
- **List**: "Scan" on the shopping list. A scan checks off the matching unchecked line (same name, or "milk"
  for "whole milk", or "eggs" for "brown eggs"), with Undo; anything not on the list can be added and checked
  off in one tap.
- Tested in headless Chromium with a fake camera showing real EAN-13 barcodes (the ZXing path, as on iPhone):
  camera scan, typed code, bad code, unknown product named by hand, review and add, list check-off and
  add-and-check. 320/375 px, light and dark. Test household deleted afterwards.
- With the security headers from main: the CSP allows `'wasm-unsafe-eval'` (the ZXing reader) and the
  Permissions-Policy allows `camera=(self)`; both were blocking the scanner.

To do:
- Try it on a real iPhone and Android phone (the camera itself can't be tested here).
