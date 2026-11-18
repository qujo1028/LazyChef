# React Native app plan

The Expo rebuild of LazyChef. Scope decisions are in [product-scope.md](product-scope.md). The current Capacitor shell is documented in [mobile-apps.md](mobile-apps.md) and stays live until the Expo app passes TestFlight.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Expo (managed), Expo Router, TypeScript | Fastest route to TestFlight through EAS Build and Submit. Camera, secure store, deep links, and notifications are all supported. |
| Repo | One repo, npm workspaces | Shared logic in one place, so web and mobile can't drift apart. |
| Server state | TanStack Query, plus Supabase realtime on `household:<id>` | Keeps the live-update behavior. |
| Styling | Theme tokens from `src/app/globals.css`, styled with NativeWind | Keeps the current look without redesigning every component. |
| Android | Out of v1 | Expo setup won't block it later. |

## Layout

```
apps/web/        current Next.js app (moves here when workspaces are set up)
apps/mobile/     Expo app
packages/core/   shared pure logic: units, ingredients, matching, grouping, dates, list plans, parsing
packages/db-types/  generated database types (from supabase/migrations)
supabase/        migrations and PGlite tests (unchanged)
```

Moving the web app into `apps/web` is its own step and happens after the core extraction, so the web app keeps building throughout.

## Backend

- **Supabase stays the backend.** The app calls the same RLS-protected tables and `security definer` RPCs as the web app. It never holds the secret key.
- **Server-only work runs in Supabase Edge Functions:** Spoonacular lookups (cached, quota-aware), AI features, barcode lookup, and the AI usage counter.
- **The RevenueCat webhook stays on Vercel** (`/api/revenuecat/webhook`).
- **Auth:** Supabase email and password, plus password reset, and Google sign-in with `expo-auth-session`. Deep links use the `app.lazychef` scheme. Reuse the logic in `src/lib/native-auth.ts` and `native-oauth.ts`.
- **Realtime:** subscribe to `household:<id>`. Refetch when the app comes back to the foreground, because the socket can drop in the background.

## Phases

Estimates assume one developer working with Claude Code.

| Phase | Scope | Exit check |
|---|---|---|
| P0 Foundations (~1 wk) | Workspaces, `packages/core` extraction with tests passing, Expo shell, Supabase client, theme, four-tab nav, CI | Empty app runs on an iOS simulator |
| P1 Accounts and household (~1 wk) | Welcome, login, signup, reset, onboarding, join by code, members, realtime | Two phones see each other's changes live |
| P2 Pantry (~1.5 wk) | Category list, quick-add sheet with autocomplete, edit sheet, "Used some," −1 with Undo, staples | Parity with the web pantry for the keep items at 375px |
| P3 Shopping list (~1 wk) | Add, check off, put away into the pantry | A list item moves to the pantry and shows for all members |
| P4 Recipes (~1.5 wk) | Make now / almost there, filters, detail, saved, my recipes, quota messaging, "add missing to list" | Searches respect the quota; cached results show when it's used up |
| P5 Barcodes and Ideas (~1 wk) | Camera scanning, the single Ideas entry point | A scan adds an item to the pantry or list |
| P6 Activity, account, legal (~3 days) | Activity feed, account and household settings, legal pages | Account deletion works end to end |
| P7 Pro billing (~1 wk, after launch) | RevenueCat SDK, soft-prompt paywall, webhook check | A test purchase unlocks Pro |
| P8 Release (~1 wk) | TestFlight, icons (light, dark, tinted), privacy manifest, export compliance, store listing | Build passes review in TestFlight |

About 9 to 10 weeks of focused work before public launch.

## Definition of done (every feature)

- `npm run typecheck`, `npm run lint`, `npm run test` pass, plus `npm run test:db` if the database changed.
- Checked at 375px on a simulator (or a device for camera and sign-in features), in light and dark.
- Matches the keep, redo, and cut decisions in [product-scope.md](product-scope.md).
- `/code-review` run on the branch, with findings fixed.

## Known risks

- **Two front ends during the rebuild.** The web app takes bug fixes only.
- **Spoonacular quota** is shared by the household. The quota design in P4 comes first.
- **Realtime on mobile** can drop in the background. Refetch on resume.
- **Pro billing** depends on the RevenueCat app code, which currently exists only on a worktree (see PROGRESS.md).
