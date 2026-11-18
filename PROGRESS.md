# Project status

Handoff file: every session reads this first and updates the matching entry before reporting done.
The older "paused / waiting for resume" notes from 2026-09-28 and 2026-09-29 were removed; the phase log below is kept.

## Current status (2026-11-18)
- **Live:** web app at https://lazychef-gamma.vercel.app (Vercel project `lazychef`). iOS is a Capacitor shell around that site (`docs/mobile-apps.md`).
- **Database:** `20261118060000_admin_dashboard.sql` is already applied to the live project (checked 2026-11-18). Still pending: `20261118120000_push_notifications.sql` (on `main`, not live). Version mismatch: `undo_cook` is recorded live as `20261118074317`, but the repo file is `20261117000100_undo_cook.sql`. Security advisor was last run 2026-09-30.
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
