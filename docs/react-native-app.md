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
| Dev builds | Expo development build (`expo-dev-client`), not Expo Go | RevenueCat and other native modules won't run in Expo Go. A dev build also avoids version surprises in Expo Go (see risks). |

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
| P0 Foundations (~1 wk) | Workspaces, `packages/core` extraction with tests passing, Expo shell, Supabase client, theme, five-tab nav (pending decision, see product-scope.md), CI, dev build | Empty app runs on an iOS simulator and on a phone via the dev build |
| P1 Accounts and household (~1 wk) | Welcome, login, signup, reset, onboarding, join by code, members, realtime | Two phones see each other's changes live |
| P2 Pantry (~1.5 wk) | Category list, quick-add sheet with autocomplete, edit sheet, "Used some," −1 with Undo, staples | Parity with the web pantry for the keep items at 375px |
| P3 Shopping list (~1 wk) | Add, check off, put away into the pantry | A list item moves to the pantry and shows for all members |
| P4 Recipes (~1.5 wk) | Make now / almost there, filters, detail, saved, my recipes, quota messaging, "add missing to list" | Searches respect the quota; cached results show when it's used up |
| P5 Barcodes and Ideas (~1 wk) | Camera scanning, the single Ideas entry point | A scan adds an item to the pantry or list |
| P6 Activity, account, legal (~3 days) | Activity feed, account and household settings, legal pages, push registration and settings (permission asked when the user first sets a reminder, not at launch), tap deep links | Account deletion works end to end; a push opens the right screen |
| P7 Pro billing (~1 wk, after launch) | RevenueCat SDK, soft-prompt paywall, webhook check | A test purchase unlocks Pro |
| P8 Release (~1 wk) | TestFlight, icons (light, dark, tinted), privacy manifest, export compliance, store listing | Build passes review in TestFlight |

About 9 to 10 weeks of focused work before public launch.

## Definition of done (every feature)

- `npm run typecheck`, `npm run lint`, `npm run test` pass, plus `npm run test:db` if the database changed.
- Checked at 375px on a simulator (or a device for camera and sign-in features), in light and dark.
- Matches the keep, redo, and cut decisions in [product-scope.md](product-scope.md).
- `/code-review` run on the branch, with findings fixed.
- Anything with haptics, sound, long-press, scrolling, thumb reach, or the status bar is checked on a real phone. A simulator or Expo web can't show those.
- Time-based features (streaks, the weekly ring, challenges, expiring-soon) are tested with the dev controls below, not by waiting days.

## Testing

- **Quick loop:** Expo web at `localhost:8081` in Chrome for layout, copy, and most logic. It's faster to review, but it can't do the native features.
- **Device loop:** the dev build on a real phone for haptics, sound, thumb reach, scrolling, long-press, camera, and push.
- **Dev test controls** (only in dev builds, behind `__DEV__`): simulate a challenge completion, force-complete a challenge, reset onboarding, clear all local and household test data. Each feature that depends on time gets its controls in the same PR.
- **Visual feedback goes in as specific notes:** name the element and the problem (text colour against the background, text wrapping, icons not centred, too little top padding under the status bar, unrounded section corners). Vague notes like "looks off" cost a round trip.

## Working method

These come from a build-along video on working with Claude Code on a React Native app. The points that apply here:

- **Setup:** Claude Code in the VS Code extension, signed in with `/login` to a Claude subscription (the video uses the $20/month Pro plan). Run the Expo dev server in its own terminal, not the one Claude manages. Scan the QR code with the dev build (or Expo Go, for early checks only). Ctrl+C stops the server.
- **After the first build, run `/init`.** It writes a `CLAUDE.md` describing the architecture, theme, state, and file paths, so later sessions don't re-read every file. This repo already has a `CLAUDE.md`, so merge the new notes into it rather than replacing it.
- **`/clear` between tasks** to reset the conversation and keep token use down.
- **Permission prompts:** the video turns off the permission prompts so Claude doesn't stop at every step. That's a personal choice. It doesn't change the repo rules (no pushes to `main`, no PRs from workers).
- **Ask for the whole thing.** Claude tends to split large tasks into phases and stop early. If it does, ask it to finish the whole scope in one pass. Within this plan, that still means one feature per branch.
- **Long specs by voice are fine.** The video dictates the spec with a voice-transcription tool. Write the result into the docs, not only into the chat, so the next session can read it.
- **Ask Claude to do the work itself.** When it hands steps back ("open a terminal and run this"), tell it to run them.
- **Version pins:** install Expo packages with `npx expo install <package>` so they match the SDK. In the video, an AsyncStorage version mismatch broke Expo Go. Pasting the error text into Claude fixed it by downgrading the package.

## App design check

The video's five-part framework, applied to LazyChef. Work through it before any new screen gets built.

1. **Core function** (the app without anything else): the pantry knows what's in the house, and suggests what to cook from it. Everything else supports this.
2. **Core loop** (action, then reward within about 30 seconds): add or use food, then "I cooked this" is the action. The reward is haptic on every cook, with confetti and a stronger haptic on milestones. The weekly ring and streak update right after. The reward is in P4 and P5, and the haptic needs a real phone to check.
3. **Accessory features** (support the loop, don't change it): the Activity log, chart, and board, the household leaderboard, goals, and challenges. These are in P5. Don't start them before the core loop works on a phone.
4. **Surface area** (5 to 7 screens): five tabs (Pantry, Recipes, List, Activity, Household) plus recipe detail. Onboarding is one pass through.
5. **Retention hook** (a reason to come back): the weekly ring and the "This week" card on Pantry, a rotating challenge, and the expiring-soon push. The push opt-in happens at the first reminder, not at launch.

Test: if removing a feature leaves the core loop intact, it's an accessory. If it isn't in one of these five slots, it doesn't go in v1.

## Known risks

- **Two front ends during the rebuild.** The web app takes bug fixes only.
- **Spoonacular quota** is shared by the household. The quota design in P4 comes first.
- **Realtime on mobile** can drop in the background. Refetch on resume.
- **Pro billing** depends on the RevenueCat app code, which currently exists only on a worktree (see PROGRESS.md).
- **Package version drift.** Expo Go and newly installed packages can break on version mismatches (the AsyncStorage case). Use `npx expo install` and a dev build, and pin versions in the lockfile.
- **Sign in with Apple** is needed if Google sign-in stays in the app (see the plan decisions in the last review).
