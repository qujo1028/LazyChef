# Project status

Handoff file: every session reads this first and updates the matching entry before reporting done.
The older "paused / waiting for resume" notes from 2026-09-28 and 2026-09-29 were removed; the phase log below is kept.

## Current status (2026-11-18)
- **Live:** web app at https://lazychef-gamma.vercel.app (Vercel project `lazychef`). iOS is a Capacitor shell around that site (`docs/mobile-apps.md`).
- **Database:** every repo migration through `20261119024109_library_expansion.sql` is live (checked 2026-11-18, including push notifications). Pending: `20261120000100_weekly_goal.sql` on `feature/p6-activity-account`. Migration lock: held by `feature/p6-activity-account` (P6 lead). Version mismatch: `undo_cook` is recorded live as `20261118074317`, but the repo file is `20261117000100_undo_cook.sql`. Security advisor was last run 2026-09-30.
- **Planned:** a React Native (Expo) rebuild of the app. Plan in `docs/react-native-app.md`, scope decisions in `docs/product-scope.md`. The web app takes bug fixes only until the Expo app passes TestFlight.
- **Open items:**
  - Revisit onboarding in the Expo app once the rest of the app is built (after P6 or so): the first pantry items step, copy, and whether it shows off the core loop, now that the screens it leads into exist. User asked for this on 2026-11-18.
  - Supabase project is on the free plan. Upgrade to Pro before launch, or it pauses after a week idle.
  - Google sign-in: enable the provider in Supabase (Auth → Providers) with a Google OAuth client, then test it in the app.
  - Sign in with Apple is built but off (`NEXT_PUBLIC_APPLE_SIGN_IN=1`). Needs the Apple Developer Program.
  - RevenueCat app code, paywall, and "Extended search" UI exist only on the `pantry-monetization-audit` worktree, not on `main`.
  - Android app not built.
  - Real-phone checks still open: live sync on two phones, barcode camera on iPhone and Android, and the Xcode build of the Swift sign-in plugin.

## Phase log
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

Both migrations are live, and the Supabase security advisor was run on 2026-09-30.
Done since: Dependabot (weekly npm, monthly Actions), CodeQL (`security-extended`), `npm audit` in CI,
and an incident checklist in the README. A scan of the full git history found no committed secrets,
so no keys need rotating. The security plan is finished.

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

## Local recipe library (2026-09-30, branch `local-recipes`)
Built:
- **Migration `20261005000100_local_recipes.sql`** (applied to the live DB 2026-09-30 via the Supabase connector, recorded as 20261005000100): `recipes` + `recipe_ingredients`
  (shared library with `household_id` null, household recipes with it set; unique `(source, source_id)`),
  `save_household_recipe()`, `match_local_recipes()`, the private `recipe-photos` bucket (5 MB, images only,
  members only, `<household>/<file>` paths), `saved_recipes.local_recipe_id` + `image_url`, and `cook_recipe()`
  with an optional local recipe id. 16 new PGlite tests (`local-recipes.test.mjs`), 77 total. The harness got
  storage stand-ins. Also applied cleanly to a local Supabase stack (`supabase start`).
- **Importer** `npm run recipes:import` (`scripts/import-themealdb.mjs`, converter in
  `src/features/recipes/import/themealdb.ts`, fixture tests). Dry run with the test key: 790 recipes,
  8,152 ingredient lines, 97% matched to the library (top misses: "oil", "sweetcorn", "hotsauce").
- **Matching** (`local-match.ts`): the DB counts have/missing by library id or normalized name (pantry names
  widened so "brown rice" covers "rice"), then the same `toSuggestion` check as Spoonacular results. Ranked by
  fewest missing, then most pantry items used. Merged local-first, de-duplicated by title.
- **UI**: title search (`?q=`), source tags, "Show more ideas", an Ours tab, `/recipes/new` and
  `/recipes/[id]/edit` (parser-backed ingredient box with suggestions, steps, photo resized in the browser),
  recipe pages for all three sources, hearts for local recipes, Spoonacular bookmarks keep id + title + image.
- CSP `img-src` now allows `www.themealdb.com` and the Supabase origin (signed photo links).

Not done:
- Browser check at 320/375 px (ran out of time). Do it after the migration is applied.
- Shopping list lines from local recipes keep only the recipe title (the list's `recipe_id` is Spoonacular's).

Done 2026-09-30: the import ran with TheMealDB's test key (790 recipes, 8,152 ingredient lines) and the PR
merged. Re-run `npm run recipes:import -- --write` with a supporter key if you get one (it upserts, no copies).

## Account deletion (2026-11-08, branch `claude/app-store-launch-checklist-d68e57`)
Needed for the App Store (guideline 5.1.1(v)); see `docs/app-store-launch.md` for the rest of the launch list.
Built:
- **Migration `20261108000100_account_deletion.sql`** (applied to the live DB 2026-11-08 via the Supabase connector, recorded as 20261108000100; security advisor shows nothing new):
  - `tidy_household` trigger on `household_members` (after delete): the last member out deletes the household
    with everything in it, and an ownerless household passes to its longest-standing member. Works however the
    membership goes, including a user deleted from the Supabase dashboard. `leave_household` is unchanged.
  - `stamp_recipe` and `stamp_shopping_list_item` kept `created_by` / `checked_by` fixed, which put a deleted
    user's id back after the foreign key cleared it (the delete failed). They now let go once the profile is gone.
  - 8 PGlite tests (`supabase/tests/account-deletion.test.mjs`), 85 total.
- **"Delete account"** on the Household page (You card), with a confirm dialog. `deleteAccount`
  (`src/features/account/actions.ts`) deletes the auth user with the secret key (`src/lib/supabase/admin.ts`),
  removes the recipe photos of households that were deleted, clears the session and shows
  "Your account was deleted." on `/login`. Needs `SUPABASE_SECRET_KEY` (already set in Vercel).
- Activity entries in shared households stay, shown as "Someone".

Not done:
- End-to-end check with a throwaway account (no Docker here for a local stack).
  Checked so far: typecheck, lint, build, unit + DB tests, and the `/login?deleted=1` message at 375 px.
- The Supabase project was found paused (free plan, a week idle) on 2026-11-08 and restored. Upgrade to Pro
  before launch, or it will pause again.
- When Sign in with Apple is added, revoke the Apple token on deletion too (Apple requires it).

## iOS and Android app shell (2026-11-09, branch `claude/ios-android-app-production-9561f4`)
Capacitor 8.5.3 shell around the live site; setup and how it works in `docs/mobile-apps.md`.
Built:
- `capacitor.config.ts` (loads https://lazychef-gamma.vercel.app, `CAP_SERVER_URL` overrides for dev),
  `ios/` and `android/` projects (`app.lazychef`), npm scripts `ios`, `android`, `cap:sync`.
- Offline screen `native/www/offline.html` (`server.errorPath`), retries when the connection comes back.
- Google sign-in inside the app: in-app browser tab + `app.lazychef://auth/callback` back into the app
  (`signInWithGoogle` returns the URL when the form says `native`). Website behaviour unchanged.
- iOS: camera/photo permission text, link scheme, `ITSAppUsesNonExemptEncryption` = NO, iPhone + portrait only.
  Android: camera permission, link scheme, portrait only.
- Status bar spacing: sign-in, sign-up, onboarding and invite pages (and their loading/error screens) and toasts
  now leave room for the status bar and camera cutout. The tab pages' header already did.
- Checks: typecheck, lint, build, 1,665 unit tests (4 new for the app link). Built and run on the iPhone 17 Pro
  simulator (iOS 26.5): live site loads, offline screen shows, Google opens in an in-app sheet.

Not done:
- Android app not built: Android Studio isn't installed (the user chose not to install it for now).
- Google sign-in is turned off in Supabase (Auth → Providers). Turn it on with a Google OAuth client, then test it
  in the app. Supabase Site URL and Redirect URLs were fixed on 2026-11-09.
- Tab pages (Pantry, List…) not checked in the simulator: needs a signed-in account.
- App icon and splash screen are still Capacitor's defaults.

## iOS audit fixes, native sign-in, AI features (2026-11-10, branch `claude/lazychef-code-terminal-469696`)
iOS (Phase 1):
- Real app icon (light, dark, tinted) and cream/dark launch screen, drawn from the site's logo by
  `scripts/build-native-images.mjs` (re-run after logo changes). Replaces Capacitor's placeholders.
- `PrivacyInfo.xcprivacy`; one bridge view controller at launch (storyboard keys removed from Info.plist);
  dynamic web view background (no cream flash in dark mode); trimmed AppDelegate.
- Google sign-in return link handled on cold launch too (`App.getLaunchUrl()`, once per link).
- Links to other sites open in an in-app browser sheet (`native-external-links.tsx`).
Sign-in (Phase 2):
- `LazyChefAuth` plugin (`ios/App/App/LazyChefAuthPlugin.swift`, `src/lib/native-auth.ts`): Google via
  ASWebAuthenticationSession (no "Open in LazyChef?" prompt); older builds/Android keep the browser tab.
- Sign in with Apple built but off until `NEXT_PUBLIC_APPLE_SIGN_IN=1` (owner not in the Apple Developer
  Program yet; no entitlement added). Steps in `docs/mobile-apps.md`.
- Apple token revocation on account deletion, dormant until the APPLE_* env vars are set. Web sign-ins keep
  Supabase's provider refresh token when given; otherwise deletion shows how to remove LazyChef from the Apple ID.
- Migration `20261110082750_apple_refresh_tokens.sql` applied to the live DB 2026-11-10.
AI (Groq, `GROQ_API_KEY` set locally and in Vercel Production/Preview on 2026-11-10):
- Shared: `src/lib/llm/ai.ts` (`askAiJson`, hourly 'ai' limit), `src/components/ai/ai-consent.tsx` (per-feature
  consent, guideline 5.1.2; `AiLabel`), Groq in the privacy policy.
- Quick-add from text (pantry bulk add), recipe idea from the pantry (Recipes), tidy scanned names (scanner),
  substitutions (recipe detail).
- Migration `20261110082751_ai_rate_limit.sql` applied to the live DB 2026-11-10. It keeps the `pro_sync` bucket
  from the subscriptions migration, which is live but not on main yet: when that branch merges, make sure its
  migration doesn't redefine these functions without `ai`.
Checks: typecheck, lint, build, 1,769 unit tests, 94 DB tests; /code-review findings fixed.

Not done:
- No Xcode build in this session (sandbox blocks SwiftPM); Swift only type-checked against a Capacitor stub.
  Run `npm run ios` and test: launch screen, dark mode, Google sign-in (warm and cold), outside links.
- AI features not tried against the real Groq API or in a browser.
- Quick-add isn't on the shopping list (no review step there); list scan sheet has no "Tidy name".

## Live-only migrations recovered (2026-11-16, branch `claude/recover-live-migrations`)
Two migrations had been applied to the live database from the `pantry-monetization-audit` worktree but were in no
pushed branch (the second wasn't committed at all). Copied here unchanged; both match what Supabase recorded
(md5 of `schema_migrations.statements` equals the files):
- `20261108000200_subscriptions.sql`: `subscriptions`, `revenuecat_events`, `private.pro_comps`,
  `get_pro_status()`, and the `pro_sync` rate-limit bucket. `20261110082751_ai_rate_limit.sql` runs after it and
  keeps both `pro_sync` and `ai` (checked on the live DB).
- `20261109000100_extended_recipes.sql`: `recipes.extended` (244 TheMealDB recipes flagged) and
  `match_local_recipes(..., p_extended boolean default false)`. Main's 10-argument calls still work.
- Their PGlite tests (`subscriptions.test.mjs`, `extended-recipes.test.mjs`) and the matching `database.ts` types.
  110 DB tests pass.

Not brought over (still only in that worktree): the RevenueCat app code, the paywall, the "Extended search" UI,
and `src/features/recipes/import/extended.ts`. Re-running `npm run recipes:import` from main leaves the
`extended` flags as they are (the importer doesn't write that column), but newly imported recipes won't be flagged.

## Admin dashboard (2026-11-18, branch `feature/build-the-rest-of-de-e73`)
Built on the `/admin` foundation (`ADMIN_EMAILS` guard, from `feature/admin-dashboard-guar-828`). One director session
(Opus) split the work across 8 subagents (Sonnet for data, Board, Overview, Support; Haiku for Health, Limits,
Alerts), each on its own branch and file allowlist, tracked as Kandev subtasks. Every branch was reviewed and
merged here.
- Tabs: **Overview** (users, revenue/MRR, usage, trends, funnel, retention, popular, alert banner), **Board**
  (GitHub issues with move/close/reopen, PRs), **Health** (deploys, CI, services, RevenueCat events, env),
  **Limits** (Spoonacular, AI allowance, rate limits, errors, cache), **Support** (exact-email lookup, Pro comps,
  audit log). Details in the README's "Admin dashboard" section.
- Migration `20261118060000_admin_dashboard.sql`: 23 `admin_*` functions (service_role only), `private.daily_counters`,
  `private.daily_snapshots`, append-only `private.admin_audit_log`; `take_rate_limit` and `take_ai_allowance` now
  count (same signatures, grants and bucket allowlist). Tests in `supabase/tests/admin-stats.test.mjs`.
- Daily Vercel Cron → `/api/admin/snapshot` (`CRON_SECRET`): snapshot + alerts as GitHub issues labelled `alert`.
- E6 counters: AI errors, Spoonacular errors and cache hit/miss (fire-and-forget).

Not done / to do:
- **Apply the migration to the live database** before the deploy that ships this (the app calls the new RPCs).
- Set `CRON_SECRET`, `GITHUB_DASHBOARD_TOKEN` (Issues: read & write; PRs, Deployments, Commit statuses,
  Metadata: read), `GITHUB_REPO` and `ADMIN_EMAILS` in Vercel.
- Not tried in a browser or against the real GitHub repo / live data; charts unchecked at 320 px and in dark mode.
- `parse-line.test.ts` "stays fast" is timing-sensitive and can fail when the whole suite runs in parallel.

## Trim to five screens (feature/trim-screens)

- Five tab screens (Pantry, Recipes, List, Activity, Household) plus recipe detail. `/pantry/add`, `/recipes/saved`,
  `/recipes/ours`, `/recipes/new`, `/recipes/[id]/edit`, `/activity/stats` and `/pro` are gone as pages and redirect
  permanently (`src/lib/legacy-routes.ts`, wired in `next.config.ts`). The older notes above name the old addresses.
- Bulk add is a sheet on Pantry; Saved and Ours are tabs on Recipes; add/edit recipe is a sheet; Stats is a view of Activity;
  the paywall opens from the Pro card on Household.

## Migration sync (2026-11-18, branch `fix/migration-sync`)
- `20261118091235_push_notifications.sql` applied to the live database (it was on `main` but not live). The recorded
  hash matches the file exactly.
- `undo_cook` was live under version `20261118074317`, but the repo file was `20261117000100`. The live function
  bodies match the repo exactly (`cook_recipe` and `undo_cook`). Only the recorded version and the stored statement text
  differ. Renamed the file to `20261118074317_undo_cook.sql`. The file's SQL is unchanged.
- `20261118060000_admin_dashboard.sql` was already live (hash matches the file).
- `npm run test:db`: 216 passing.

## P0 Foundations (2026-11-18, lead: `feature/p0-scaffold`)
Step 0 scaffold (lead):
- npm workspaces (`apps/*`, `packages/*`). The web app stays at the repo root until the planned move to `apps/web`.
- `apps/mobile`: Expo SDK 58, Expo Router (`src/app`), bundle ID `app.lazychef.mobile`, scheme `app.lazychef`. All P0
  packages are installed, so workers don't change `package-lock.json`.
- React pinned to 19.3.0 for both apps so the workspace has one copy.
- NativeWind dropped: v4 needs Tailwind 3 and broke next to the web app's Tailwind 4. Styling is `StyleSheet` plus a theme object.
- Phone testing is Expo Go via QR code until P7 (no Apple Developer account yet).
- Root `tsconfig.json` and `eslint.config.mjs` skip `apps/`; Vitest also runs `packages/*/src/**/*.test.ts`.
- Checks: web typecheck, lint, 2,207 tests and `next build` pass; mobile typecheck, lint, and iOS and web bundles pass.

W2 shell (`feature/p0-shell`):
- Theme in `apps/mobile/src/theme` (light and derived dark palette with measured contrast, radius, spacing, type scale, `useTheme()`).
- Fonts (Libre Caslon Display, Source Sans 3) load in the root layout; splash stays up until loaded.
- Four JS tabs in `(tabs)` (Pantry, Recipes, List, Household) with a custom `BottomTabBar`; Activity is a header icon pushing `activity`.
- Components: `AppScreenHeader`, `PrimaryPillButton`, `MetadataPill`, `CircleIconButton`, `BottomTabBar`, `Screen`, `EmptyState`.
- Reduce motion respected (`useReduceMotion`, `usePressScale`). Not checked visually (no simulator run); only tsc, lint and iOS/web exports.

Workers (branch from `feature/p0-scaffold`): W1 `feature/p0-core` (packages/core extraction), W2 `feature/p0-shell`
(theme, tabs, components), W3 `feature/p0-data` (Supabase, Query, offline), W4 `feature/p0-config` (db-types, CI, EAS).
Migration lock: nobody (P0 has no schema changes).

W4 config (`feature/p0-config`):
- CI runs `typecheck`, `lint` and an iOS `expo export` for `apps/mobile` after `npm ci`. No secrets needed.
- `apps/mobile/eas.json`: `appVersionSource: remote`; profiles `development` (dev client, internal), `preview` (internal),
  `production` (autoIncrement). No EAS project ID yet, so nothing has been run against EAS.
- `app.json`: `ios.config.usesNonExemptEncryption: false`, Android adaptive icon background `#F8F6EC`, splash dark
  background `#1B1A12` via the `dark` key of the expo-splash-screen plugin.
- `packages/db-types` re-exports the generated `Database` type and typechecks from the mobile app.

W3 data layer (`feature/p0-data`):
- `apps/mobile/src/lib/supabase.ts`: publishable-key client, no throw when env is missing, auto refresh follows AppState.
- Session tokens in expo-secure-store, chunked across keys (`chunked-storage.ts`, 8 Vitest cases); localStorage on Expo web.
- `query-client.ts`: TanStack Query persisted to AsyncStorage (24h, buster = app version), focus via AppState, online via NetInfo, cache cleared on sign out or account switch.
- `use-session.ts` hook, `providers/app-providers.tsx`, `providers/offline-banner.tsx`, `apps/mobile/.env.example`.
- Chunk tests are not in the root Vitest include; run with a config whose `include` is `apps/mobile/src/lib/**/*.test.ts`.

W1 core extraction (`feature/p0-core`):
- 134 files (`git mv`) from `src/` into `packages/core/src/<domain>/`: units, ingredients (library, parsing, aisles,
  emoji, substitutions), dates (`days.ts` was `pantry/dates.ts`, `time.ts` was `activity/time.ts`), state (row-state),
  pantry, list, recipes (match, local-match, cook, scale, taste, TheMealDB import, recipe-shapes), activity (feed,
  stats), habit (all of it, including the reward timeline), auth (safe-next, native callback, password schemas),
  preferences, pro, barcodes, household (invite codes), push (prefs).
- Import as `@lazychef/core/<domain>/<module>` (units: `@lazychef/core/units`). Core uses relative imports only; row
  types come from `@lazychef/db-types` via `packages/core/src/db.ts`. An ESLint rule blocks next, react, react-dom,
  react-native, expo, Capacitor and `@/` imports in `packages/core`.
- Splits: `HapticKind` now lives in `haptics/kinds.ts` (used by `habit/reward.ts` and the web haptics); the first-run draft's shape and parsing are in
  `preferences/draft.ts`, with localStorage reads and writes left in `src/features/preferences/draft.ts`.
- Left in `src/`: anything server-only or AI-prompt related (Spoonacular, LLM prompts, substitution guards, push
  delivery, RevenueCat), Capacitor code (`native-auth`, haptics, `apple.ts`), Next-specific helpers (legacy routes,
  search params, `?view=` parsing, site env), and admin logic.
- `scripts/build-ingredient-library.mjs` and `scripts/import-themealdb.mjs` point at the new paths.
- `auth/safe-next` and `auth/native-callback` need a WHATWG `URL`: on mobile import `react-native-url-polyfill/auto`
  first (RN's built-in URL mis-parses `///evil.com` and custom schemes).
- For the lead (outside W1's files): CLAUDE.md (the one-test example `src/features/habit/leaderboard.test.ts`,
  `src/lib/row-state.ts`, `src/features/pro/plans.ts`), README.md:315 and docs/handoff-*.md, docs/mobile-apps.md
  still name moved paths. `packages/core/src/db.ts` copies the `Tables`/`Enums` helpers; once
  `@lazychef/db-types` exports them, core should import them from there.

Lead merge (P0): all four workers merged into `feature/p0-scaffold`. Follow-ups done by the lead: mobile loads
`react-native-url-polyfill/auto` first (needed by supabase-js and the core auth helpers), Vitest also runs
`apps/mobile/src/lib/**/*.test.ts`, stale paths in CLAUDE.md and README fixed. Checks: web typecheck, lint, 2,219 tests,
`next build`, ingredients check; mobile typecheck, lint, iOS bundle. On a real iPhone via Expo Go (2026-11-18): tabs,
header, fonts and theme look right (user checked). Still open: old file paths in `docs/handoff-*.md` and
`docs/mobile-apps.md` (historical docs, left as is); `db.ts` in core repeats the `Tables`/`Enums` helpers.

## P1 Accounts and household (2026-11-18, lead: `feature/p1-accounts`)
Based on `origin/main` (P0 merged as PR #67, with the audit exceptions in `scripts/audit.mjs`).
Migration lock: nobody (P1 uses the existing tables and RPCs: `create_household`, `join_household`,
`get_invite_preview`, `regenerate_invite_code`, `remove_member`, `leave_household`).

Step 0 (lead):
- Packages installed so workers don't change `package-lock.json`: `expo-apple-authentication`, `expo-auth-session`,
  `expo-crypto`, `expo-clipboard`.
- Supabase client uses the PKCE flow (`flowType: 'pkce'`): OAuth and email links come back with `?code=`.
- `useSession()` now reads one shared `SessionProvider` (`src/lib/use-session.tsx`, mounted in `AppProviders`).
- `src/lib/household.ts`: `useHouseholdContext()`, `useActiveHousehold()`, `pickActiveMembership()` and `queryKeys`
  (every key starts with `['household', ...]`).
- Route gate in the root layout with `Stack.Protected`: signed out sees `(auth)`, signed in without a household sees
  `onboarding`, otherwise `(tabs)` and `activity`. `index`, `auth/callback`, `reset-password` and `join/[code]` are
  always reachable. Stub screens for each worker.
- Components: `TextField`, `FormMessage`, and `PrimaryPillButton` gained `variant` (primary, outline, text, danger)
  and `loading`.
- `src/providers/household-channel.tsx` stub with the web app's `HouseholdChannelProvider` / `useHouseholdChanges`
  signatures, mounted in the tabs layout. The header shows the active household's name.

Workers (branch from `origin/feature/p1-accounts`): W1 `feature/p1-auth` (welcome, sign in and up, reset, Google,
Apple, callback), W2 `feature/p1-onboarding` (onboarding, join by code and link), W3 `feature/p1-household`
(Household tab: members, invite, rename, leave, switch, sign out), W4 `feature/p1-realtime` (household channel,
resume refetch).

W4 realtime (`feature/p1-realtime`):
- `apps/mobile/src/providers/household-channel.tsx`: private channel `household:<id>` after `supabase.realtime.setAuth()`.
  Exports unchanged (`HouseholdChannelProvider`, `useHouseholdChanges`, `HouseholdChange`) plus
  `useHouseholdChannelStatus()` (`connecting | live | offline`) and a `__DEV__` status log.
- `households` / `household_members` broadcasts invalidate `queryKeys.all`; other tables go to `useHouseholdChanges`
  listeners with the web's payload mapping.
- Background drops the channel; `active` and NetInfo reconnect resubscribe and, once subscribed, invalidate household
  queries (missed broadcasts). `CHANNEL_ERROR`, `TIMED_OUT` and unexpected `CLOSED` retry with capped, jittered backoff
  (1s to 30s). `TOKEN_REFRESHED` calls `setAuth(token)`. Channel operations are serialized so a remount or household
  switch never stacks channels; unmount and sign out remove the channel.
- Pure logic and tests: `apps/mobile/src/lib/household-realtime.ts` and `.test.ts` (payload mapping, backoff, status).
- Manual two-phone check (two accounts in one household, both signed in on real devices):
  1. Phone A renames the household. Phone B's header and Household tab show the new name without a refresh.
  2. A second account joins by invite code. Both phones' member lists gain the member without a refresh.
  3. Background phone B (home screen), change the household name on A, wait 30s, reopen B. It catches up within a
     second or two of resuming.
  4. Turn airplane mode on for B, change something on A, turn it off. B catches up.
  5. Switch households on A and check B is unaffected; sign out on B and confirm no console errors from the channel.
  Dev builds log `[realtime] household channel live/connecting/offline`.
- Not verified here: any of the above on a device (needs two signed-in devices). Item/pantry listeners
  (`useHouseholdChanges`) have no consumers until P2.

W2 onboarding (`feature/p1-onboarding`):
- `app/onboarding.tsx`: "Welcome, <first name>!", then Start a household (name, then "What's in your kitchen?" with typed
  lines plus staple chips, "Skip for now") or Join with a code. The household is created on the last step only, so the
  gate doesn't switch away mid-flow; `add_pantry_items` failures are ignored (the household exists). If the refresh
  after creating fails, a "Your household is ready" retry replaces the form so nobody creates a duplicate. A pending
  invite shows "You're invited to <household>" first with Join and "Not now". A failed household load with no data
  shows "Couldn't load your household" with Retry. Small Sign out button.
- `app/join/[code].tsx` (`app.lazychef://join/CODE`): signed out stores the code (AsyncStorage, 7 days) and goes to
  `/welcome`; signed in previews it (invalid, rate limited, network error, already a member then set active and open
  the pantry, or "Join <household>?" with member count).
- Files: `features/invite/` (`join.ts`, `InviteCard.tsx`, `pending-invite-store.ts`), `features/onboarding/StapleChips.tsx`,
  `components/Card.tsx` (the one card style), `components/FormScreen.tsx` (keyboard avoiding), `lib/first-pantry.ts`,
  `lib/invite-code.ts`, `lib/invite-preview.ts`, `lib/pending-invite.ts` with Vitest tests.
- Not built: universal links on the website domain (needs an Apple Developer account and an apple-app-site-association file).
- Unverified: nothing was run on a device or simulator, and nothing was written to the live project. The join and create
  flows, keyboard behaviour, Dynamic Type and the 375pt layout are untested on screen.

W1 auth (`feature/p1-auth`):
- Built: welcome (display-font name, web pitch, Apple on iOS when enabled, Google, email, create account), sign in,
  sign up (sends `display_name` metadata, "Check your email" state when there is no session), forgot password,
  reset password, and `auth/callback` (`?code=` PKCE exchange, `error` params, `next` through core `safeNext`,
  exchange guarded to run once per code). Google uses `signInWithOAuth` with `skipBrowserRedirect` and
  `WebBrowser.openAuthSessionAsync`; cancel is quiet. Apple uses the native button, a nonce from `expo-crypto`,
  `signInWithIdToken`, and saves the first-sign-in name to user metadata and `profiles` (same rule as the web).
- Pure and tested: `packages/core/src/auth/forms.ts` (form schemas), `apple.ts` (name, hex, new-account rule),
  `apps/mobile/src/lib/auth/` (`errors.ts`, `callback-url.ts`, `once.ts`). Native glue: `redirect.ts`, `google.ts`, `apple.ts`.
- `app.json`: `expo-apple-authentication` plugin and `ios.usesAppleSignIn`. `.env.example`: `EXPO_PUBLIC_APPLE_SIGN_IN`.
- Not checked: no simulator or signed-in device here, so none of the flows ran end to end (only tsc, lint, iOS bundle, Vitest).
- Not ported: the web stores Apple's authorization code server-side to revoke the Apple link on account deletion.
  The app does not send it yet; handle with account deletion (needs an Edge Function).
- You must configure: Supabase Auth, URL Configuration, redirect allow list entries `app.lazychef://**` and, for Expo
  Go, `exp://**`; the Google provider (works in Expo Go through the in-app browser); for Apple, the Apple Developer
  account, the Supabase Apple provider with the bundle id `app.lazychef.mobile` as a client id, then set
  `EXPO_PUBLIC_APPLE_SIGN_IN=1` and make a dev build (Expo Go does not carry the Apple entitlement for this app).

W3 household (`feature/p1-household`):
- Household tab (`apps/mobile/src/app/(tabs)/household.tsx`) with one card style: household name with owner-only inline
  rename, invite card (large code, Share via the web `/join/<code>` link, Copy code with expo-clipboard, owner-only Reset
  with confirm), members (name, role, "You", joined date, owner-only Remove with `Alert`), switch household (only with
  more than one), leave (danger, confirm, owner hand-over copy), and a Sign out card (temporary until P6).
- Code: `src/features/household/api.ts` (members query under `queryKeys.members`, mutations that fail fast with
  "You're offline" and invalidate `queryKeys.all`), `src/features/household/components/*`, and pure helpers with 
  tests in `src/lib/household-settings.ts`.
- Pull to refresh, loading, error-with-retry; cached data shows offline via the app-wide banner.
- Not checked on a device or against the live backend (no signed-in account here). Needs no shared-file changes.

Lead merge (P1): W4, W2, W1, W3 merged into `feature/p1-accounts` in that order. The workers ran on Sonnet (first
launched on Opus by mistake, then relaunched). Each worker's `/code-review` reviewed the base stub instead of its own
diff, so the lead reviewed every diff by hand. Fixes on merge:
- Tabs layout always mounts `HouseholdChannelProvider` (null id means no channel), so the tabs never remount.
- A cold start offline with nothing cached shows "You're offline" instead of a blank screen.
- Realtime listeners are isolated (one throwing can't stop the others).
- Onboarding: a retry after `create_household` succeeded could create a second household (stale state in a closure).
- `auth/callback` also accepts `?token_hash=&type=` email links, like the web callback.
- `useSession`: a late `getSession()` can no longer overwrite a newer session from the auth listener.
Checks: web typecheck, lint, 2,298 tests, ingredients check, `scripts/audit.mjs`; mobile typecheck, lint, iOS and web exports.

Open for P1's exit check (needs the user and real phones):
- Supabase: add `app.lazychef://**` and `exp://**` to the redirect allow list; turn on the Google provider.
- Email templates (README) link to `{{ .SiteURL }}`, so confirm and reset emails open the website, not the app. Changing
  that affects the web app, so it's a separate decision.
- Apple sign-in needs the Apple Developer account, the Supabase Apple provider with `app.lazychef.mobile`, and a dev build.
- Two-phone live test: steps in the W4 section above. Nothing in P1 has run on a device yet.
- For P2 worker briefs: tell workers to point `/code-review` at their own branch diff.

Phone check (2026-11-18): the user tried P1 on a phone in Expo Go and everything worked.
To do later: revisit onboarding once the rest of the app is built (also in the open items at the top).

## P2 Pantry (2026-11-18, lead: `feature/p2-pantry`)
Based on `origin/main` (P1 merged as PR #68). Migration lock: nobody (P2 uses the existing `pantry_items`,
`category_overrides`, `add_pantry_items` and `adjust_pantry_quantity`).

Step 0 (lead):
- Packages: `@react-native-community/datetimepicker` (via `npx expo install`, config plugin added) and `zod`.
- `src/features/pantry/api.ts`: reads (paged) and writes as the signed-in user, same rules as the web actions
  (`addItems`, `addStaples`, `updateItem`, `adjustQuantity`, `deleteItem`), each returning `{ error }` and failing fast
  offline. `previewItems` resolves typed text locally (household fixes, library, keyword guess); no Spoonacular on
  mobile until an Edge Function exists.
- `src/features/pantry/pantry-provider.tsx`: `PantryProvider` in the tabs layout, `usePantry()` (`items`, `query`,
  `apply`, `adjust`) and `usePantryItem(id)`. Fetches merge with core row-state rules; `pantry_items` broadcasts apply live.
  Query key `queryKeys.pantry(id)` sits under `['household']`, so resume and household refetches include it.
- Components: `Toast` (`useToast().show({ message, action })`, app-wide, renders under native modals), `Sheet` (iOS page
  sheet with title, Close, pinned footer), `SelectField`, `Chip`; `features/pantry/components/PantryFields.tsx`
  (`CategoryField`, `UnitField`, `ExpiryField`). `src/lib/use-today.ts`, `src/lib/db-error.ts`.
- Stubs with fixed props: pantry screen, `AddFoodSheet`, `ReviewList`, `AddSeveralInput`, `EditItemSheet`.
- Deferred: "Add to shopping list" on ran-out items (P3), Spoonacular categorizing (Edge Function), barcode (P5),
  the "This week" card (P4). Delete keeps the web's confirm, no Undo.

Workers (branch from `origin/feature/p2-pantry`, all Sonnet: typical feature work): W1 `feature/p2-pantry-screen`,
W2 `feature/p2-add-food`, W3 `feature/p2-review`, W4 `feature/p2-edit`.

W3 review (`feature/p2-review`, Sonnet): `ReviewList` (one `Card` per draft: emoji, name, amount, `UnitField`,
`CategoryField` with source hint or "We'll remember this for next time.", `ExpiryField`, "Always on hand" `Switch`,
"Remove <name>" button, inline `draftError` text when `showErrors`; a plain map, no nested lists) and `AddSeveralInput`
(160pt multi-line box, live count via `parseLines`, help line when empty, error line). `insertPastedLines` is not used:
RN has no paste event and a multi-line `TextInput` keeps pasted line breaks itself. Helper `lib/add-several-hint.ts`
with a test. No shared-file changes. Not checked: simulator layout (emoji and remove button alignment against the
name field, VoiceOver, Dynamic Type), sheet scrolling with many drafts.

W4 edit (`feature/p2-edit`):
- `EditItemSheet`: header with emoji, name, amount and category, who added it and when; "Used some?" (units converted),
  "We ran out", the edit form (name, amount and unit, category, expiry, Always on hand), Save (disabled until something
  changes; errors show inside the sheet, with a rollback), Delete with an `Alert` confirm. If a housemate deletes the
  item while it is open, the sheet says so with a Close button. The form starts fresh each time the sheet opens.
- Toasts wait until the sheet has closed (`src/lib/after-close.ts`, with tests), since they render under native modals.
- Skipped: "Add to shopping list" (P3). No shared-file changes.
- Not checked on a device or against the live backend (no simulator or signed-in account). Checks: mobile typecheck,
  lint, `npm test`, `npx expo export -p ios`.

W1 pantry screen (`feature/p2-pantry-screen`):
- `(tabs)/pantry.tsx` ported from the web pantry view: summary line, search with clear and "Nothing called X / Add X",
  Expiring soon, one card per category, "Always on hand" chips, collapsible "Ran out" (open while searching), "-1" with a
  light haptic and a toast with Undo (gives back only what was taken), getting-started card with kitchen basics
  (`addStaples`), floating "Add food" pill. One FlatList over flattened rows; pull to refresh; loading, error with
  retry, and an offline note when nothing is cached.
- Code: `src/lib/pantry-rows.ts` (rows builder and `amountTaken`, tested), and `features/pantry/components/`
  `PantryItemRow`, `PantrySectionRows`, `PantrySearch`, `GettingStarted`. No shared files changed.
- Not checked on a device or simulator. Known gaps: "Add to shopping list" on ran-out rows waits for P3.

W2 add food (`feature/p2-add-food`):
- `AddFoodSheet` (stub props kept): quick mode with one input, autocomplete from `searchIngredients` for the name at the
  caret (`suggestionQuery`, `replaceNameAtCaret`, bold `matchRange`, in `SuggestionList.tsx`), "N items" hint, an "Add several"
  toggle to W3's `AddSeveralInput` that keeps the text, then W3's `ReviewList` step with Back and "Add N to pantry".
- Flow: `previewItems` then `draftsFromResolved`; `draftsToItems` null shows field errors; `addItems` errors show inside
  the sheet; success closes, then the toast (`describeAdditions`) is held by `createAfterClose` until the sheet has closed.
  Text and review survive a close; a new seed or a finished add starts fresh. Input autofocuses after the slide-in.
- Pure helpers with tests: `src/lib/add-food.ts` (`highlightParts`, `reviewTitle`, `addButtonLabel`, `stateOnOpen`).
- Not checked on a device: keyboard avoidance, autofocus timing in the page sheet, caret placement after picking a
  suggestion (uses a controlled `selection` released on the next selection event), pasting a multi-line list into the
  one-line box (iOS may flatten line breaks; "Add several" handles lists). No shared-file changes.

Lead merge (P2): W3, W4, W1, W2 merged into `feature/p2-pantry` in that order. Every worker kept the stub props, so the
merges were clean apart from PROGRESS.md. W3 skipped `/code-review`, so the lead reviewed its diff (no findings); the
lead also read W1, W2 and W4's diffs. Fix on merge: the add sheet showed an error twice in "Add several" mode and put
the review error under a long list (now above it). Checks: web typecheck, lint, 2,316 tests; mobile typecheck, lint, iOS
and web exports.

Open for P2's exit check (needs the user and a phone in Expo Go):
- At 375pt, light and dark: pantry list, search, staples, ran out, the add sheet (autocomplete, Add several, review,
  date picker), the edit sheet (Used some, We ran out, save, delete).
- Keyboard and caret behaviour in the page sheet; "-1" haptic and Undo; toasts appear after a sheet closes. The toast
  sits over the "Add food" pill while it shows.
- Two phones: an add, -1 or edit on one shows on the other without a refresh.
- Known gaps for later: a failed save rolls back over a housemate's newer change; the edit form doesn't refresh when a
  housemate edits the same item; ran-out "Add to shopping list" is P3; categorizing unusual names needs a Spoonacular Edge Function.

## P3 Shopping list (2026-11-18, lead: `feature/p3-list`)
Based on `origin/feature/p2-pantry`, because P2 (PR #69) isn't merged yet and P3 builds on its toast, sheet, fields and
pantry provider. Rebase onto `origin/main` once #69 merges. Migration lock: nobody (P3 uses the existing
`shopping_list_items`, `add_to_shopping_list` and `complete_shopping_trip`).

Step 0 (lead):
- `src/features/list/api.ts`: same rules as the web list actions (`addListText`, `addListItems`, `setChecked`,
  `updateListItem`, `deleteListItems`, `putAway`), each returning `{ error }` and failing fast offline. The web's
  "added to the list" push is server-only and waits for P6.
- `src/features/list/list-provider.tsx`: `ListProvider` in the tabs layout (inside `PantryProvider`), `useList()`
  (`items`, `query`, `apply`, `setItemChecked`, `toggle` with an Undo toast) and `useListItem(id)`. Query key
  `queryKeys.list(id)`.
- `ReviewList` gained an optional `hints` prop (per draft key) for put away's "Adds to your ..." notes.
- Stubs: list screen, `ListEditSheet`, `PutAwaySheet`, `features/list/add-to-list.ts` (`useAddPantryItemToList`).
- Deferred: scan to check off (barcodes, P5).

Workers (branch from `origin/feature/p3-list`): W1 `feature/p3-list-screen` (Sonnet: screen with grouping, quick add,
check off), W2 `feature/p3-list-edit` (Sonnet: edit sheet with delete and Undo), W3 `feature/p3-put-away` (Sonnet:
put away into the pantry), W4 `feature/p3-pantry-to-list` (Haiku: small, well-specified wiring of "Add to shopping
list" into the pantry screens).

W2 list edit (`feature/p3-list-edit`): `ListEditSheet` ports the web edit sheet on the P2 `EditItemSheet` pattern (live row, fresh form per open, held toasts). Fields: name, amount (empty = any) + unit, Aisle (with the remember hint), note. Save is optimistic with rollback; Delete has no confirm and shows "Removed X" with Undo (re-adds via `addListItems`); a checked line shows who checked it and an Uncheck button. Helpers in `src/lib/list-edit.ts` with tests. Not checked: simulator or a signed-in account.

W1 list screen (`feature/p3-list-screen`):
- `(tabs)/list.tsx` ported from the web list: title and `listSummary`, quick add (`ListQuickAdd`, `addListText`, toast
  from `describeListAdditions`, text kept and error shown on failure), one card per category in store order, round
  checkbox (`toggle`, light haptic on check off) with name, amount, note and "For <recipe>", tap the body to open
  `ListEditSheet`, "In the cart" card with struck-through lines and `checkedByLabel`, "Put away N items" opens
  `PutAwaySheet` with `session + 1`, empty state, loading, error with retry, offline note, pull to refresh.
- Code: `src/lib/list-rows.ts` (rows builder, `listMeta`, `putAwayLabel`, tested), `features/list/components/`
  `ListLineRow` and `ListQuickAdd`. Reuses the pantry's `SectionHeading`. No shared files changed.
- Not checked on a device or simulator. Skipped: ingredient suggestions under the quick add (optional).

W3 put away (`feature/p3-put-away`):
- `PutAwaySheet` (stub props kept): on each new `session` it takes the lines checked right then, builds drafts with
  `draftsFromListItems`, and shows them in `ReviewList` with `mergeHints` notes from the live pantry. The full set of
  line ids is kept apart from the drafts, so removing a card skips the pantry but still clears the line.
- "Put away N items" calls `putAway(householdId, ids, draftsToItems(drafts))` (null shows field errors); "Clear without
  adding" asks with `Alert.alert` first; with no cards left only "Clear N from the list" shows. On success: remove the
  lines from `useList()`, refetch the pantry, close, then a toast held by `createAfterClose`. Errors stay in the sheet.
  Nothing checked: "Check items off first" with Close.
- Pure helpers with tests: `src/lib/put-away.ts`. No shared-file changes.
- Not checked on a device or against the live backend (no simulator or account): the sheet flow, the confirm alert,
  the toast timing, and the pantry showing the new rows on a second phone.

W4 pantry to list (`feature/p3-pantry-to-list`, Haiku):
- `features/list/add-to-list.ts`: `useAddPantryItemToList()` calls `addListItems` for the household and returns the toast
  text. The message choice is pure in `lib/add-to-list-message.ts` (with tests).
- Pantry rows: items that ran out (`quantity === 0`, not staple) get a 44pt "Add <name> to the shopping list" button
  (list icon). The screen shows the result with `useToast().show`.
- Edit sheet: "Add to shopping list" under the ran-out and used-some buttons. It closes the sheet, then sends the result
  through the sheet's `send`. The "Moved X to Ran out" toast gets an "Add to list" action using the item as it was before.
- Not checked on a device or simulator (no signed-in account). Checks: mobile typecheck, lint, `npm test`, `npx expo export -p ios`.
- Found, not changed: the edit sheet's "We ran out" shows when `quantity === null` (the "On hand" untracked case), while
  "ran out" is `quantity === 0`. Looks like a P2 mismatch; worth a look in the lead's review.
- Review (`/code-review`, medium) fixes: a second tap on a row's list button while its add is in flight is ignored.
  Left as they are: the sheet's held toast can wait if the sheet is reopened before the add settles (`send` is per spec);
  `useAddPantryItemToList` reads `householdId` via `useList()` as specified (re-renders on list changes); casing
  (lowercase on add, display case on "already on the list") as specified; the hook has no unit test (needs a provider).

Lead merge (P3): W2, W1, W3, W4 merged into `feature/p3-list` in that order; only PROGRESS.md conflicted. The lead
read every diff. Fix on merge: the list edit sheet closes before removing the line, so it never shows "someone removed
this" for your own delete. W4 asked about "We ran out" showing for untracked items: that's intended (it sets an
"On hand" item to 0, like the web). Checks: web typecheck, lint, 2,334 tests; mobile typecheck, lint, iOS and web exports.
The P3 PR is stacked on P2 (base `feature/p2-pantry`) until PR #69 merges.

Open for P3's exit check (needs the user and phones in Expo Go):
- At 375pt, light and dark: quick add, check off with Undo, the edit sheet, put away (cards, hints, date picker),
  "Clear without adding", and "Add to shopping list" from a ran-out row, the pantry edit sheet and the Ran out toast.
- Two phones: an item added on one shows on the other; checking off and put away move it into the pantry on both.
- Known gaps: a failed list edit rolls back over a housemate's newer change (same as the pantry sheet); a housemate's
  change while put away is open makes the save fail with an error instead of refreshing the cards; scan to check
  off waits for P5; the "added to the list" push waits for P6.

## P4 Recipes and cooking (2026-11-18, lead: `feature/p4-recipes`)
Based on `origin/main` (P2 and P3 merged as PRs #69 and #70). Migration lock: nobody (P4 uses the existing recipes,
saved_recipes, match_local_recipes, cook_recipe, undo_cook and activity_log). The Spoonacular Edge Function is new
server code but no migration; deploying it to the live project and setting its secret waits for the user's go-ahead.

Step 0 (lead):
- Packages: `react-native-svg` (via `npx expo install`, for the weekly ring).
- `packages/core/src/recipes/edge-contract.ts`: request and response types for the `recipes` Edge Function
  (`suggest`, `info`, `quota`), the quota shape (`pointsLeft`, `resetsAt`, `resting`) and error codes.
- `apps/mobile/src/features/recipes/edge.ts`: `callRecipes()` (never throws; a missing function reads as
  `not_configured`, so screens fall back to the local library).
- `apps/mobile/src/features/habit/use-habit.ts`: `useHouseholdCooks()` (activity_log 'cooked' rows, refetched on
  broadcasts), `cookEventsFor()`, `useHabit()` (summary in the device time zone, plus the events cookRecipe needs).
- `lib/haptics.ts` (`haptic(kind)` on expo-haptics), `lib/time-zone.ts`, `lib/use-now.ts`; query keys for cooks,
  recipes, saved, one recipe, and the quota.
- Route `app/recipe/[id].tsx` in the signed-in stack (header with back). Stubs: recipes tab, recipe page,
  `CookSheet`, `ThisWeekCard`.
- Typed routes: `.expo/types/router.d.ts` is generated and gitignored. After adding a route, run
  `CI=1 npx expo start --offline` in apps/mobile for a few seconds to regenerate it, or tsc rejects the new path.

Workers (branch from `origin/feature/p4-recipes`): W1 `feature/p4-recipes-screen` (Sonnet), W2
`feature/p4-recipe-detail` (Sonnet), W3 `feature/p4-cook` (Sonnet), W5 `feature/p4-edge-recipes` (Opus: server code
holding the Spoonacular key, auth, quota and rate limits). W4 `feature/p4-habit` (Sonnet: ring and This week card)
starts when the first slot frees up (max 4 at once).

W3 cook and reward (`feature/p4-cook`, Sonnet):
- `CookSheet` (same props and `CookRecipe`): plans against the live pantry with `planCook` once per open, deduct lines with an
  editable amount and a Skip switch, "check this" lines (start skipped), staples, basics and missing items just listed.
  Confirm "Take N items out" calls `cook_recipe` through `features/recipes/cook-api.ts` (`cookRecipe`, `undoCook`: fail fast
  offline, `{ error }` results). The habit before and after is computed on the phone with `useHabit` events, then the cooks
  query is invalidated and the pantry refetched.
- Reward: `features/habit/use-reward.tsx` and `components/RewardBurst.tsx` (reanimated ring pulse, flame pop, confetti).
  `lib/reward-plan.ts` wraps the core timeline: under reduce motion it keeps ONE haptic (success, or milestone) and static
  visuals, no confetti motion (the core timeline alone has no haptics under reduce motion; this follows the brief).
- Done view: "Nice! You cooked X", what came out, the habit line ("3 of 3 this week", "4 day streak"), a milestone line,
  "Add to list" for anything that ran out, and Undo (`undo_cook`). A "Cooked X" toast with Undo is held with
  `createAfterClose` until the sheet closes; undoing inside the sheet replaces it.
- Dev only (`__DEV__`): "Dev: play milestone reward" and "Dev: play cook reward" in the sheet.
- Pure helpers with tests: `lib/cook-done.ts`, `lib/reward-plan.ts`. No shared-file changes.
- Not checked on a device (no simulator or account): haptics, confetti, the sheet flow, the held toast, the live RPCs.

W2 recipe detail (`feature/p4-recipe-detail`, Sonnet):
- `app/recipe/[id].tsx`: loads by ref (`queryKeys.recipe`, 10 minute stale time since Spoonacular lookups cost points).
  Local recipes read from `recipes` + `recipe_ingredients` as the user (household photos signed from `recipe-photos`);
  Spoonacular ones through `callRecipes({ action: 'info' })`. Not found, not set up, resting, rate limited and offline each
  show a message with "Try again"; a cached copy shows with a one-line offline note.
- Page: image (expo-image), title, source and time pills, "Cooked N times · last Sep 12" (from `useHouseholdCooks`),
  save heart, checklist against the live pantry (have, basic, need, "On the shopping list"), "Add missing to list"
  (`addListItems`, toast from `describeListAdditions`), numbered steps, source link and TheMealDB or Spoonacular credit
  (expo-web-browser), sticky "I cooked this" opening `CookSheet`. Header title set with `Stack.Screen options`.
- Files: `lib/recipe-view.ts` (+ tests), `features/recipes/recipe-api.ts`, `components/IngredientChecklist.tsx`,
  `components/RecipeSaveButton.tsx` (own heart; the lead can dedupe with W1's). No shared-file changes.
- Not checked: simulator, signed-in account, the Edge Function (not deployed), household photo signing, the heart on a
  real saved list. Not ported: serving scaler, rating thumbs, edit own recipe, AI swaps (not in this task).
W1 recipes screen (`feature/p4-recipes-screen`):
- `(tabs)/recipes.tsx`: Suggested / Saved / Mine chips on one screen. Suggested has "Make now" and "Almost there (1 to 3
  missing)" sections with "Missing: x, y", a title search (debounced; library first, Spoonacular only when fewer than
  10 local ideas), a quota line ("Spoonacular: N searches left today, resets at 5 pm", or a plain "resting", "not set
  up", "offline" note that still shows library results) and the Spoonacular credit when its recipes show. Saved lists
  `saved_recipes` ("Can make now" / "Have 5 of 7" for library recipes, no match for Spoonacular ones), sorted ready
  first. Mine lists the household's recipes, newest first. Heart (`FavoriteButton`) saves and unsaves with an instant
  update and rollback; `saved_recipes` broadcasts refetch it. Pull to refresh on every filter.
- Code: `features/recipes/{local,saved,use-suggestions}.ts`, components `RecipeCard`, `FavoriteButton`,
  `SpoonacularCredit`; pure helpers with tests in `src/lib/recipe-{quota,cards,ideas}.ts`. No shared files changed.
- Not checked (no simulator, account, or deployed Edge Function): the screen on a device, the Spoonacular top-up and
  quota line against the real function, realtime on a second phone. Skipped: diet and cuisine preferences, thumbs
  taste ranking, cook history on saved cards, matching saved Spoonacular recipes (needs the `info` call), creating
  recipes (Mine only lists them).

W4 habit ring and This week card (`feature/p4-habit`, Sonnet):
- `WeekRing.tsx` (react-native-svg ring, olive on a pill track, reanimated fill unless reduce motion, label "2 of 3 cook
  days this week") and `WeekDots` (Mon to Sun). `ThisWeekCard.tsx` uses `useHabit()`: ring, streak, tier with next-tier
  hint, active challenge, "Welcome back" on comeback, and at most one nudge (expiring food from the live pantry; dismissed
  per day in AsyncStorage). The card hides while loading or on error. Goal is `DEFAULT_GOAL` until goals exist.
- Skipped: the "almost there" and "first cook" nudges (they need recipe data the Pantry does not have).
- Mounted in `app/(tabs)/pantry.tsx` as the FlatList `ListHeaderComponent` (hidden while searching).
- Dev only (`__DEV__`): "Dev preview" row on the card with cook days, streak, comeback and challenge done presets. It
  overrides the summary shown, never written anywhere.
- Pure helpers with tests: `lib/week-card.ts`. No shared-file changes.
- Not checked on a device: ring animation, layout at 375px, dark mode, reduce motion, dismissal persistence.

W5 recipes Edge Function (`feature/p4-edge-recipes`, Opus, 2026-11-18):
- `supabase/functions/recipes/`: `suggest`, `info`, `quota` per `edge-contract.ts` (contract unchanged). Caller's JWT
  checked with `auth.getUser()`, household membership read as the caller (RLS), `take_rate_limit` as the caller
  (`recipe_search` per search that misses the cache, `recipe_open` per uncached recipe in `info`), failing closed if
  any check errors. Service role only for `spoonacular_cache` / `spoonacular_usage` (same keys as the web, so the web
  and the phone share the hourly cache). Quota headers recorded (estimate as fallback); 3-point reserve for searches,
  1 for details; 402 rests until midnight UTC. Status codes: 400, 401, 403 (not a member), 405, 429, 502, 503,
  and 200 for `resting`. No migration needed.
- Pure parts (`handler.ts`, `validate.ts`, `cache.ts`, `spoonacular.ts`) have Vitest tests; Deno-only files are
  `index.ts` and `db.ts` (`deno check index.ts` passes with deno 2.9). Root `tsconfig.json` now excludes
  `supabase/functions`; `npm run typecheck` checks the pure modules and tests through `supabase/functions/tsconfig.json`.
  Vitest includes `supabase/functions/**/*.test.ts`.
- Shared modules (recipe-shapes, edge-contract, ingredient normalize, Spoonacular cost) are generated copies in
  `supabase/functions/_shared/core/` (`node scripts/sync-edge-shared.mjs`; a test fails when a copy is stale),
  because the Supabase bundler resolves files under `supabase/functions` and Deno needs `.ts` import paths.
- Deploy (lead, after the user's go-ahead; not done): in your own terminal `supabase login`, then
  `supabase link --project-ref <ref>`, put `SPOONACULAR_API_KEY=...` in the gitignored `supabase/functions/.env` and run
  `supabase secrets set --env-file supabase/functions/.env`, then `supabase functions deploy recipes` (JWT verification
  stays on). Smoke test with the curl in `supabase/functions/recipes/README.md`. CI has no Deno, so `deno check` is
  manual for now.
- Self-review fixes: names are sent to Spoonacular as their normalized keys (no cache poisoning across households),
  `take_rate_limit` only counts an explicit true, the body is read after auth with a streaming 16 KB cap, `info`
  fetches as many uncached recipes as today's points cover. Open for the lead: (1) the diet and intolerance filters the
  web applies to Spoonacular ideas aren't in the Edge contract, so mobile ideas ignore allergies unless the app filters
  them (contract change); (2) a partial `info` answer doesn't say why the rest are missing (only `quota.resting`);
  (3) one account can still drain the shared 50 daily points in about an hour (same as the web); a household or
  global bucket needs a migration.

Lead merge (P4): W3, W2, W1, W4, W5 merged into `feature/p4-recipes` in that order. The lead read each diff; W5 was
reviewed for auth (JWT via `getUser`, membership read as the caller), the service role limited to the Spoonacular
cache and usage tables, rate limits failing closed, and `supabase/functions/.env` being gitignored.
Fix on merge: Recipes showed a spinner forever offline with nothing cached; it now says you're offline with Try again.
Checks: web typecheck, lint, 2,434 tests, audit, ingredients check; mobile typecheck, lint, iOS and web exports;
`deno check` on the function.

Edge Function deployed (2026-11-18, user approved): `recipes` v1 is live on the LazyChef project with JWT
verification on, deployed through the Supabase connector; the deployed files were diffed against the repo (all 11
identical). `SPOONACULAR_API_KEY` is set as a function secret (the Vercel copy is marked sensitive and can't be pulled,
so the user supplied the key; it was pasted in chat, so rotate it in the Spoonacular console and update Supabase,
Vercel and `.env.local`). Smoke test: no auth 401, a non-user token 401 with the function's own JSON, CORS preflight
204. Not yet tested with a signed-in session (do it from the app on a phone). Redeploy after changes with
`npx supabase functions deploy recipes --project-ref gldppemwlecnbarxamcb` (the CLI is logged in on this Mac now).

Open before P4's exit check:
- Diet and allergies are not applied on mobile yet (library ranking or Spoonacular calls). The web filters both. This
  matters for allergies, so it's the first P4 follow-up: filter library results with core `localFits`, and add
  diet/intolerances to the edge contract for Spoonacular.
- One account can still spend the household's shared daily points (same as the web); a per-household limit needs a migration.
- On a real phone: the cook reward (haptic on every cook, confetti on milestones), Undo, the ring and streak updating
  right after a cook on both phones, the dev reward and This week controls, 375pt in light and dark.
- Known gaps: cooks must take at least one item out (same as the web and the database); undoing a cook doesn't
  remove list items it added; Mine has no create or edit form yet; taste ranking and cook history on saved cards
  aren't ported.

## Library expansion: 150 American + 150 Chinese recipes (2026-11-18, lead: `feature/library-expansion`)
Based on `origin/feature/p4-recipes` (PR #71 still open; the mobile recipe page lives there). **Migration lock:
`feature/library-expansion`** (`20261119024109_library_expansion.sql` and `src/types/database.ts`), cleared when it merges.

Why: the shared library had 33 "United States" and 27 "Chinese" recipes, and TheMealDB has no more. Narrow pantries got
fewer than 10 local ideas and fell back to Spoonacular's 50 daily points.

Built (the first session stopped after the code; the P5 lead session finished the data on 2026-11-18):
- Migration: `recipe_source` value `lazychef` (no household, slug as `source_id`), photo credit columns on `recipes`
  (`image_author`, `image_license`, `image_license_url`, `image_source_url`, `image_ai_generated`), public bucket
  `library-photos` (no policies, so only the secret key writes). PGlite test `supabase/tests/library-expansion.test.mjs`.
- Recipes: dish lists from two Sonnet agents (American, Chinese) deduped against all 790 library titles, written by 30
  Haiku agents, checked by `checkLibraryRecipe` (`packages/core/src/recipes/import/lazychef.ts`, which parses lines with
  the TheMealDB importer's `toIngredient`), then reviewed by Sonnet agents.
- Photos: Wikimedia Commons (CC0, public domain, CC BY, CC BY-SA, at least 1200 px), picked by Haiku and checked by
  Sonnet; AI images only for the rest, after the user picks a provider.
- Credits: `SOURCE_LABELS.lazychef` ("LazyChef kitchen"), `photoCredit()` (`packages/core/src/recipes/photo-credit.ts`)
  shown under the photo on the web and mobile recipe pages.
- Import: `npm run recipes:lazychef -- --dry-run | --write` (`scripts/import-lazychef-library.mjs`), reading the reviewed
  `data/lazychef/recipes.json`.

Finished (P5 lead session, 2026-11-18, worktree `.claude/worktrees/library`, pushed to `feature/library-expansion`):
- The first session's uncommitted work was committed as found (`8885fc4`) so it was on GitHub.
- Dishes: `data/lazychef/dishes.json`, 150 American and 150 Chinese, none matching a library title by `titleKey`.
- Recipes: written by 10 Sonnet agents (30 each) against `checkLibraryRecipe`, merged into `data/lazychef/recipes.json`.
  Dry run: 300 recipes, 3,280 ingredient lines, 3,212 matched, no notes. Spot-checked by the lead. "Hunan Steamed Fish
  Head" became "Hunan Steamed Fish with Chopped Chilies" (it uses fillets).
- Ingredient library: specialty items no longer fall back to generic ones (century eggs were "eggs", winter melon
  "melon", wood ear mushrooms "mushrooms", tofu skin "tofu", Chinese noodles "pasta"); added those plus lotus and bamboo
  leaves.
- Photos: `scripts/find-library-photos.mjs` lists Commons candidates (CC0, public domain, CC BY, CC BY-SA, at least
  1200 px) into `data/lazychef/photo-candidates.json`; 5 Sonnet agents looked at the thumbnails and picked one per dish
  or none. 254 photos, 46 dishes without. The lead dropped picks showing a different dish or a brand, and tidied 4 author
  names. No AI images (needs the user to pick a provider, if wanted).
- Checks: web typecheck, lint, 2,445 tests, `npm run test:db` (221 pass), ingredients check; mobile typecheck and lint.

Still to do (each needs the user's OK):
- Done 2026-11-18 (user approved): the migration is live as `20261119024109` (applied through the Supabase connector; the file was renamed to match). Security advisor: nothing new.
- Done 2026-11-18 (user approved): `npm run recipes:lazychef -- --write` imported the 300 recipes (1,090 in the library
  now) and uploaded all 254 photos to `library-photos` (public URL checked). Two fixes to get there:
  `scripts/lib/ts-paths.mjs` no longer rewrites requires inside node_modules (it broke sharp), and the importer
  retries uploads and imports a recipe without its photo if the image can't be read, instead of stopping.
- Then check a few recipe pages and their photo credits on the web and on a phone, and clear the migration lock when
  the branch merges.

## P5 Barcodes and Ideas (2026-11-18, lead: `feature/p5-barcodes-ideas`)
Based on `origin/feature/p4-recipes`, because P4 (PR #71) isn't merged yet and P5 builds on its recipes screen, Edge
Function pattern and list helpers. Rebase onto `origin/main` once #71 merges. Migration lock: held by
`feature/library-expansion`, not P5. P5 needs no migration (household_barcodes, take_ai_allowance, take_rate_limit
'ai', ai_idea_cache, put_ai_idea_cache, save_ai_recipe and the members-only `ai_usage` read already exist). If a worker
finds it needs one, it stops and tells the lead, who asks the user.

Decisions (user, 2026-11-18):
- Ideas: a sparkle "Ideas" button in the Recipes header opens one Ideas sheet. v1 has recipe ideas only (meal, an
  optional hint, up to 3 ideas from the pantry, save to Mine, add missing to list, the free count shown). Pantry
  "split with AI" and scan "tidy name" wait until after v1. Recorded in `docs/product-scope.md`.
- Barcode lookup: the phone calls Open Food Facts directly; household barcode memory is read and written as the user
  (RLS). Recorded in `docs/react-native-app.md` (Backend).
- Scan to check off on the List: not in P5 (pantry only). Recorded under Cut in `docs/product-scope.md`.

Step 0 (lead):
- Packages: `expo-camera` (via `npx expo install`), with its config plugin and camera permission text in `app.json`.
- `packages/core/src/ai/edge-contract.ts`: the `ai` Edge Function contract (`ideas`, `allowance`), the allowance shape,
  error codes. Copied to `supabase/functions/_shared/core/ai-contract.ts` by `scripts/sync-edge-shared.mjs`.
- `apps/mobile/src/features/ideas/ai-edge.ts`: `callAi()` (never throws; a missing function reads as `not_configured`).
- Query keys `aiAllowance(householdId)` and `barcodes(householdId)`.
- Recipes tab header: `IdeasButton` (sparkles) next to Activity, opening the `IdeasSheet` stub.
- Stubs with final signatures: `features/barcodes/lookup.ts` (`lookupBarcode`, `rememberBarcodes`),
  `features/barcodes/components/BarcodeScanner.tsx` (`onCode`, `active`), `features/ideas/components/IdeasSheet.tsx`.

Workers (branch from `origin/feature/p5-barcodes-ideas`):
- W1 `feature/p5-edge-ai` (Opus: server code holding the Groq key, auth, the free allowance, rate limits, prompt
  injection): `supabase/functions/ai/`.
- W2 `feature/p5-ideas` (Sonnet: the Ideas sheet, consent, count line, save and add-missing).
- W3 `feature/p5-scanner` (Sonnet: the camera scanner and scanning inside the Add food sheet).
- W4 `feature/p5-barcode-lookup` (Sonnet: Open Food Facts from the phone and the household barcode memory, with tests).

W4 (`feature/p5-barcode-lookup`, Sonnet): `features/barcodes/lookup.ts` is filled in. `lookupBarcode(householdId, input)`
checks the household's `household_barcodes` row (as the user, RLS), then calls Open Food Facts v2 straight from the phone
(6 s timeout, identifying User-Agent). It never throws, reads offline as friendly copy, and caches results per session
(per household and code). `rememberBarcodes` inserts new codes and updates known ones (name, amount, unit only), ignores
23505 and never fails the caller. Pure parts and tests: `lib/barcode-off.ts`, `barcode-cache.ts`, `barcode-memory.ts`.
No tidy flag (AI tidy is out of v1). Not checked: a signed-in account, live RLS writes from a phone.
W2 (Ideas sheet, `feature/p5-ideas`): `IdeasSheet` is built. Meal chips (default by time of day via core `autoSlot`),
an optional hint, "Get ideas for dinner", per-device consent in AsyncStorage keyed to the `MEAL_IDEAS_SENDS` wording
(the lead later made the allowance call load before consent: it sends only the household id), the "7 of 10 free ideas left this week" line from `callAi` (updated from
each ideas response), up to 3 idea cards (have/need, steps, Save to Mine via `save_ai_recipe` then bookmark, Add missing
to list), and a screen for loading, not set up, offline, rate limited, empty pantry, upstream error with Try again, and
limit reached (core `limitMessage`; no purchase button until P7). Toasts wait for the sheet to close (`after-close`).
Dev only: "Dev: preview a state" chips in the sheet. New core files: `packages/core/src/ai/idea-save.ts` (+ test), which
holds ports of `ownInputFromIdea`, `ingredientRows` and `MEAL_IDEAS_SENDS`; the web copies are untouched. Pure copy and
state mapping: `apps/mobile/src/lib/ideas-copy.ts` (+ test). Not checked: a simulator or phone, a signed-in account,
and the real function (not deployed, so everything past "not set up" ran only through the dev previews).

W3 (scanner, `feature/p5-scanner`): `BarcodeScanner` is a real expo-camera `CameraView` (ean13, ean8, upc_a, upc_e),
asks for the camera on first use, has a denied state with Open Settings, a torch button and a typed-code box (the only
control on Expo web). The Add food sheet has a "Scan barcodes" button that opens a scan view (camera, scan list with
remove and "name it by hand" for unknown products, Open Food Facts credit); Done writes each hit's line into the box and
goes to the usual review, so there is still one way to add food. After an add the codes are remembered with
`rememberBarcodes`, named as added (one package's amount, `barcodeMemories`); the scan-to-draft link (`lib/scan-links.ts`)
keeps a renamed item under its new name. Pure logic with tests: `lib/scan-dedupe.ts` (same code within 2.5 s ignored),
`scan-rows.ts`, `scan-links.ts`. State hook: `features/barcodes/use-scan-rows.ts`. Dev only: "Dev: fake scan" (3017620422003).
Not checked: the camera, the permission prompt, the torch and haptics (need a real phone), or a signed-in lookup.
The `barcodes` query key isn't invalidated after remembering (W4 owns reads, if any).

W1 ai Edge Function (`feature/p5-edge-ai`, Opus, 2026-11-18):
- `supabase/functions/ai/`: `ideas` and `allowance` per `ai/edge-contract.ts` (contract unchanged). JWT checked with
  `auth.getUser()`, then membership; everything runs as the caller (pantry, preferences, ratings and titles,
  `ai_idea_cache` / `put_ai_idea_cache`, `take_ai_allowance`, `get_pro_status` + `ai_usage` for the read-only allowance,
  `take_rate_limit('ai')`). No service role client at all. Order: pantry (`empty_pantry`), cache (free hit), rate limit
  (`rate_limited`), allowance (`limit_reached`), Groq. The brief said allowance before rate limit (as the web), but then
  an hourly refusal burns a free use, against CLAUDE.md's "after cache hits and refusals"; so the rate limit goes first. Fails closed on any check error. One use per request;
  the model gets one retry when nothing in its answer is usable. Status codes: 200 (also `empty_pantry`), 400, 401, 403,
  405, 429 (`limit_reached`, `rate_limited`), 502, 503. No migration needed.
- Hint: cleaned (control, zero-width and bidi characters out, single-spaced, at most 100), sent as quoted data in the user
  message, and part of the cache key (an object entry, lowercased). Without a hint the key is byte for byte the web's,
  so web and phone share cached ideas.
- Shared code: the pure meal-ideas parts moved to `packages/core/src/recipes/ai/{idea,meal-ideas}.ts`; the web files
  re-export them. To keep the large generated ingredient catalog out of the function, `BASICS` (`recipes/basics.ts`),
  `pantrySearchNames` / `isAvailable` (`recipes/pantry-names.ts`), the taste hints (`recipes/taste-hints.ts`) and the
  cooked-recipe reader (`activity/cooked-recipe.ts`) are split out and re-exported from `match.ts`, `taste.ts` and
  `feed.ts` (no exported signature changed). Name matching uses `ingredients/library/normalize.ts`, which is what the
  catalog's `normalizeIngredientName` already calls. `scripts/sync-edge-shared.mjs` now rewrites relative imports to the
  flat copy names and throws if a copied file imports one that isn't copied. CORS, the bearer token and the capped body
  reader moved to `supabase/functions/_shared/http.ts`; `recipes/handler.ts` re-exports them (same behavior, so the
  deployed `recipes` needs no redeploy).
- `deno check` passes for `ai/index.ts` and `recipes/index.ts` (deno 2.9.8). Not deployed, no secrets set: see
  `supabase/functions/ai/README.md` (deploy, dashboard secret, curl smoke test). Not checked: a live Groq call, a
  signed-in session, the deployed function.
- Self-review fixes: rate limit before allowance (above); pantry and ratings read in pages of 1000 (up to 5000);
  taste read alongside the pantry and diet; bidi isolate, soft hyphen and Arabic letter mark characters stripped from the
  hint; a non-text hint gets its own message; `filters.ts` no longer copied (the meal list check moved to a test).
  Open for the lead: (1) a cache hit still fails with `upstream` if the read-only allowance can't be read, since
  `AiSuccess` requires `allowance` (an optional allowance would need a contract change); (2) `limit_reached`'s "come
  back Friday" weekday is worded in UTC, so the app may prefer to word it from `resetsAt`; (3) the read-only allowance
  uses `AI_FREE_WEEKLY` (10), since only `take_ai_allowance` returns the database's limit; (4) `ai/groq.ts` is a port of
  `src/lib/llm/client.ts`, not shared code (moving the web client into core is a follow-up); (5) the web's
  `getMealIdeas` still takes the allowance before the rate limit.

Lead merge (P5): W4, W2, W3, W1 merged into `feature/p5-barcodes-ideas` in that order; only PROGRESS.md conflicted. The
lead read every diff; W1 was reviewed for auth (`getUser`, membership as the caller), no service role at all, rate limit
and allowance failing closed, the key only in Groq's Authorization header, the hint as user-message data, and logs
without pantry names or the hint. Fixes on merge: barcodes Open Food Facts doesn't know aren't cached (a housemate's
name shows on the next scan); the Ideas count loads before consent (it sends only the household id); the empty pantry
note names the Add food button; the scan list clears once its lines are in the box (no doubled lines after a failed
check). Checks: web typecheck, lint, 2,515 tests, audit, ingredients check, edge sync check; mobile typecheck, lint, iOS
and web exports; `deno check` on `ai` and `recipes`.

Open for P5's exit check (needs the user and a phone in Expo Go):
- Scan to add (the exit check): Add food, Scan barcodes, review, add; the scan haptic; a re-scan shows the saved name;
  the camera permission prompt and the denied state; the torch; an unknown product named by hand.
- The Ideas sheet at 375pt, light and dark; then end to end once `ai` is deployed with `GROQ_API_KEY`: consent, the
  count line, 3 ideas, Save to Mine, Add missing to list, the limit message.
- Known gaps: camera permission isn't re-checked after returning from Settings; the same idea can be saved twice; two
  scans with identical line text share one barcode link (as on the web); `ownInputFromIdea` exists twice in core
  (`ai/idea-save.ts` from W2 and `recipes/ai/meal-ideas.ts` from W1), to fold into one; the web's `getMealIdeas` still
  takes the allowance before the rate limit (a web bug fix: swap the order); the `limit_reached` weekday is UTC;
  `recipes` on the live project predates the shared `_shared/http.ts` move (same behavior; redeploy it next time it
  changes).
- Deployed 2026-11-18 (user approved): `GROQ_API_KEY` set as a function secret from `.env.local` through a temporary,
  gitignored `supabase/functions/.env` (deleted afterwards; the key never went through chat), and `ai` v1 deployed with
  JWT verification on (`npx supabase functions deploy ai --project-ref gldppemwlecnbarxamcb`). The 20 deployed files
  were diffed against the repo: all identical. Smoke test: no auth 401 (gateway), a non-user token 401 with the
  function's own JSON, CORS preflight 204. Not yet tested with a signed-in session: do it from the Ideas sheet on a phone.

## P6 Activity, account, legal (2026-11-18, lead: `feature/p6-activity-account`)
Based on `origin/main` (P5 and the library expansion merged as #72 and #73). Migration lock: held by this branch
(`20261120000100_weekly_goal.sql`). Workers don't touch `supabase/migrations/` or `src/types/database.ts`; a worker
that needs a schema change stops and tells the lead.

Decisions (user, 2026-11-18; recorded in `docs/react-native-app.md` and `docs/product-scope.md`):
- Account deletion and app-triggered pushes are Vercel routes with bearer auth, reusing the web code.
- Push goes through Expo's push service until the P7 dev build (Expo tokens in `device_tokens`, no migration).
  Needs `eas init` once for the EAS project ID (user, free Expo account).
- Avatar: the sign-in photo or initials. No upload in v1.
- A stored weekly cook goal per person (1 to 7, default 3).

Step 0 (lead):
- Migration `20261120000100_weekly_goal.sql`: `user_preferences.weekly_goal` and `set_my_weekly_goal()`; 6 PGlite
  tests (`weekly-goal.test.mjs`); types updated.
- `packages/core/src/push/app-contract.ts` (+ test): routes, `notifyRequestSchema` (ids only), responses, error
  codes, `isExpoPushToken`, `pushTapRoute`.
- Mobile: `expo-notifications` (plugin in `app.json`), `lib/web-api.ts` (`callWebApi`, `EXPO_PUBLIC_API_URL`),
  query keys `activity`, `weeklyGoal`, `notificationPrefs`, `features/habit/use-weekly-goal.ts` (wired into the ring
  and the cook done lines), the `account` route, and stubs: `features/push/{PushBridge.tsx,notify.ts}`,
  `features/push/components/NotificationsCard.tsx`. `PushBridge` is mounted in the root layout.

Workers (branch from `origin/feature/p6-activity-account`):
- W1 `feature/p6-server-routes` (Opus: bearer auth, account deletion, push delivery to housemates).
- W2 `feature/p6-activity` (Sonnet: the Activity screen: log, chart, board, challenge and goal).
- W3 `feature/p6-account` (Sonnet: the Account screen and the Household tab cleanup).
- W4 `feature/p6-push-app` (Sonnet: registration, permission at first toggle, tap deep links, notify calls).


### W3 `feature/p6-account`: Account screen and Household tab cleanup
- Household tab: `SignOutCard` is gone; a "Your account" row (avatar, name, email, chevron) sits at the top and opens `/account`.
- `app/account.tsx` cards in order: Profile (name edit, 1 to 60 chars, `profiles` update as the user; photo only when `avatar_url` is https, else initials), Weekly goal (stepper over `useWeeklyGoal`/`useSetWeeklyGoal`), Food preferences (no mobile editor existed; new card over `set_my_preferences` with core options, invalidates recipe queries on save), Notifications (W4's `NotificationsCard`), About (Privacy, Terms, Support in `expo-web-browser`, app version), Sign out, Delete account.
- Haptics toggle skipped: the app has no haptics setting (`lib/haptics.ts` always fires), so there is nothing to toggle.
- Delete: confirm alert with the outcome copy, then `callWebApi(APP_API.deleteAccount)`; success clears the query cache and persisted cache, signs out locally and the welcome screen shows "Your account is deleted." (plus the Apple Settings note when `appleNotRevoked`). The notice lives in memory (`lib/account-notice.ts`) and clears when the welcome screen is left. `__DEV__` shows preview buttons for the outcomes without calling the server.
- Pure logic with tests: `lib/account.ts`, `lib/preferences.ts`. Code is in `features/account/`.
- Not checked: no simulator, no Playwright, no signed-in account; the delete route (W1) was coded against the contract only, never called. Nothing was written to or deleted on the live project.
- W3 review (`/code-review` medium on the branch diff): fixed a delete that timed out but finished (now asks the server if the login still exists before reporting failure), a failed local sign out after delete (message, busy reset, notice cleared), the deleted notice vanishing on remount (now cleared when sign in starts), the "YA" avatar fallback, overlapping goal taps (ignored while saving), and stale preference fields on save (draft keeps only edited fields). Left: the delete route is W1's and must be merged before this ships; the goal hook's rollback is the lead's.

W4 (`feature/p6-push-app`): push in the app.
- `features/push/device.ts`: `enablePush` (the first reminder: permission asked only when a switch is turned on, then
  `getExpoPushTokenAsync({ projectId })` and `register_device_token`), `refreshPushRegistration` (launch and resume,
  never asks), `unregisterThisDevice` (deletes this token from `device_tokens`, which RLS allows; there is no unregister
  function; 3 second cap; called from `SignOutCard` and the onboarding sign out before `signOut`).
- `PushBridge`: foreground handler shows no banner, the received push becomes a toast with an Open action
  (ToastProvider sits above it in `AppProviders`); taps use `useLastNotificationResponse` (covers cold start), wait for
  the root navigation state, and run once per tap. Skipped on Expo web.
- `NotificationsCard`: three switches (`use-notification-prefs.ts`, optimistic with rollback), one line explaining
  the permission ask, denied (Open Settings), no project ID, simulator or web, offline. `__DEV__` buttons fire a local
  notification per kind.
- `notifyHousemates` is wired into `addListText` and `addListItems` (only when a new line was added, not a top-up) and
  `joinWithCode` (covers onboarding and the join screen). Undo in the list edit sheet passes `{ notify: false }`:
  putting back something you just removed isn't news.
- Pure logic and tests: `lib/push-state.ts` (10 tests).
- Not checked: no device or simulator run, no real push, no signed-in account, no EAS project ID yet (`eas init`
  pending, so the card says push isn't set up). Android also needs FCM credentials in EAS before tokens work.
- Review fixes: module-level tap guard plus `clearLastNotificationResponse` so a tap never replays after signing in as someone else; the notification handler is set once; switches show the defaults if prefs fail to load.
