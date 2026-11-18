# React Native app plan

The Expo rebuild of LazyChef. Scope decisions are in [product-scope.md](product-scope.md). The current Capacitor shell is documented in [mobile-apps.md](mobile-apps.md) and stays live until the Expo app passes TestFlight.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Expo (managed), Expo Router, TypeScript | Fastest route to TestFlight through EAS Build and Submit. Camera, secure store, deep links, and notifications are all supported. |
| Repo | One repo, npm workspaces | Shared logic in one place, so web and mobile can't drift apart. |
| SDK and IDs | Expo SDK 58, React 19.3.0 (pinned to match React Native, shared with the web app), iOS bundle ID `app.lazychef.mobile` (a separate App Store app from the Capacitor shell), URL scheme `app.lazychef` | One React copy in the workspace avoids "invalid hook call" crashes. |
| Server state | TanStack Query, plus Supabase realtime on `household:<id>` | Keeps the live-update behavior. |
| Styling | A typed theme object (`apps/mobile/src/theme`) built from the palette hex values in [app-design.md](app-design.md), used with React Native `StyleSheet`. `globals.css` stays the web app's OKLCH theme. | NativeWind 4 needs Tailwind 3 and broke in the workspace next to the web app's Tailwind 4 (2026-11-18), so P0 uses plain styles. |
| Android | Out of v1 | Expo setup won't block it later. |
| Phone testing | Expo Go (scan the QR code from `npx expo start`, same Wi-Fi) through P6. An Expo development build (`expo-dev-client`) from P7, when RevenueCat arrives. | No Apple Developer account is needed until P7. Everything in P0 to P6 runs in Expo Go. Stay on the SDK that the App Store's Expo Go supports. |

## Layout

```
apps/web/        current Next.js app (moves here when workspaces are set up)
apps/mobile/     Expo app
packages/core/   shared pure logic: units, ingredients, matching, grouping, dates, list plans, parsing, and the habit logic (cook days, week, streak, tiers, challenges, leaderboard, reward timeline from `src/features/habit/`)
packages/db-types/  generated database types (from supabase/migrations)
supabase/        migrations and PGlite tests (unchanged)
```

Moving the web app into `apps/web` is its own step and happens after the core extraction, so the web app keeps building throughout.

## Backend

- **Supabase stays the backend.** The app calls the same RLS-protected tables and `security definer` RPCs as the web app. It never holds the secret key.
- **Server-only work runs in Supabase Edge Functions:** Spoonacular lookups (cached, quota-aware), AI features, barcode lookup, and the AI usage counter.
- **The RevenueCat webhook stays on Vercel** (`/api/revenuecat/webhook`).
- **Auth:** Supabase email and password, plus password reset, Google sign-in with `expo-auth-session`, and Sign in with Apple with `expo-apple-authentication` (Apple requires it when Google sign-in is offered). Deep links use the `app.lazychef` scheme. Shared parts (callback URL parsing, safe redirects) move to `packages/core`. Capacitor-specific code in `src/lib/native-auth.ts` stays in the web app. RN uses `expo-auth-session`.
- **Realtime:** subscribe to `household:<id>`. Refetch when the app comes back to the foreground, because the socket can drop in the background.

## Phases

Estimates assume one developer working with Claude Code.

| Phase | Scope | Exit check |
|---|---|---|
| P0 Foundations (~1 wk) | Workspaces, `packages/core` extraction with tests passing, Expo shell, Supabase client, theme (`apps/mobile/src/theme`), four bottom tabs (Pantry, Recipes, List, Household) with Activity in the header, offline cache (TanStack Query persisted to AsyncStorage, plus an offline banner instead of a blank screen), CI, dev build | Empty app runs on an iOS simulator and on a phone via the dev build; airplane mode shows the banner, not a blank screen |
| P1 Accounts and household (~1 wk) | Welcome, login, signup, reset, Google sign-in, Sign in with Apple, onboarding, join by code, members, realtime | Two phones see each other's changes live; Apple and Google sign-in work on a device |
| P2 Pantry (~1.5 wk) | Category list, quick-add sheet with autocomplete, edit sheet, "Used some," −1 with Undo, staples | Parity with the web pantry for the keep items at 375px |
| P3 Shopping list (~1 wk) | Add, check off, put away into the pantry | A list item moves to the pantry and shows for all members |
| P4 Recipes and cooking (~2 wk) | One recipes screen with Mine / Saved / Suggested filters, make now / almost there, detail, quota messaging, "add missing to list". The core loop: "I cooked this" sheet with Undo, the reward (haptic on every cook, confetti and a stronger haptic on milestones), the weekly ring and streak, and the Pantry "This week" card | Searches respect the quota; cached results show when it's used up; on a real phone a cook plays the reward and the ring and streak update for every member |
| P5 Barcodes and Ideas (~1 wk) | Camera scanning, the single Ideas entry point | A scan adds an item to the pantry or list |
| P6 Activity, account, legal (~1 wk) | Activity (header icon) with the household leaderboard, rotating challenges and goals, an account settings screen of its own (avatar lives here), household settings, legal pages, push registration and settings (permission asked when the user first sets a reminder, not at launch), tap deep links | Account deletion works end to end; a push opens the right screen |
| P7 Pro billing (~1 wk, after launch) | RevenueCat SDK, soft-prompt paywall, webhook check | A test purchase unlocks Pro |
| P8 Release (~1 wk) | Security audit (two fresh sessions, see below), TestFlight, icons (light, dark, tinted), privacy manifest, export compliance, store listing | Audit findings fixed; build passes review in TestFlight |

About 10 to 11 weeks of focused work before public launch.

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
2. **Core loop** (action, then reward within about 30 seconds): add or use food, then "I cooked this" is the action. The reward is haptic on every cook, with confetti and a stronger haptic on milestones. The weekly ring and streak update right after. The reward ships in P4 with recipes, and the haptic needs a real phone to check.
3. **Accessory features** (support the loop, don't change it): the Activity log, chart, and board, the household leaderboard, goals, and challenges. These are in P6. Don't start them before the core loop works on a phone.
4. **Surface area** (5 to 7 screens): four tabs (Pantry, Recipes, List, Household), Activity from the header, recipe detail, and account settings. Onboarding is one pass through.
5. **Retention hook** (a reason to come back): the weekly ring and the "This week" card on Pantry, a rotating challenge, and the expiring-soon push. The push opt-in happens at the first reminder, not at launch.

Test: if removing a feature leaves the core loop intact, it's an accessory. If it isn't in one of these five slots, it doesn't go in v1.

## Known risks

- **Two front ends during the rebuild.** The web app takes bug fixes only.
- **Spoonacular quota** is shared by the household. The quota design in P4 comes first.
- **Realtime on mobile** can drop in the background. Refetch on resume.
- **Pro billing** depends on the RevenueCat app code, which currently exists only on a worktree (see PROGRESS.md).
- **Package version drift.** Expo Go and newly installed packages can break on version mismatches (the AsyncStorage case). Use `npx expo install`, and pin versions in the lockfile.
- **Sign in with Apple** is required because Google sign-in stays. It's built in P1 and needs the Apple Developer Program account first.

## Build pipeline

Each phase goes through these stages in order. A phase isn't done until the last stage passes.

1. **Scope:** the phase's features are checked against the five-part framework in [product-scope.md](product-scope.md).
2. **Build locally** with Claude Code, one feature per branch.
3. **Design:** iterate on styles and layout against [app-design.md](app-design.md). Screenshot every screen, list the problems, then fix them.
4. **Test in three stages:** Expo web in Chrome, then the dev build with a phone mirror, then a real phone. Haptics, sound, notifications, thumb reach, scrolling, and the status bar are only checked on the real phone.
5. **Backend and auth:** migrations with RLS, tested with `npm run test:db`. Then test the feature again end to end.
6. **Security audit:** run in a fresh session, fix the ranked findings, then run it again in another fresh session (fixes can introduce new problems).
7. **Release:** TestFlight, then App Store submission (P8).

## Security audit

Run at the end of each backend phase and again before release (P8).

- RLS on every table. The repo convention already requires it; the audit confirms it.
- No secrets in the app bundle. The app gets only the publishable Supabase key (`EXPO_PUBLIC_*`). AI and Spoonacular keys stay in Edge Functions.
- Server-side validation of every input to an RPC or Edge Function. Client checks are for convenience only.
- Rate limits on AI and Spoonacular calls, so one person can't run up the bill (the existing `take_rate_limit` and `take_ai_allowance` cover the web app; the Edge Functions must call them too).
- Consistent auth checks on every RPC and Edge Function.
- No hard-coded secrets in the repo or the chat.
- Verify every new package before installing it: it exists, it's maintained, and its name isn't a near-miss of a popular package.
- Supabase advisors (`get_advisors`) and the `npm audit` step already in CI.

Supabase settings to confirm before launch:
- Email confirmation. The course disabled it for testing. Confirm the production setting is deliberate.
- Site URL and redirect allowlist for the app's deep links (`app.lazychef`).
- The project is on a plan that won't pause (see PROGRESS.md).

## Secrets and keys

- Keys live in `.env` files and the EAS secret store, never in chat. Chat history is stored locally, so anything pasted there should be treated as stored. If a key is pasted, rotate it.
- The mobile bundle gets only the publishable key. AI provider keys and the Spoonacular key stay server-side.

## Supabase setup for the RN app

- Reuse the existing project. Don't create a second one.
- Schema changes go through migrations, using the Supabase CLI. Run `supabase login` in a separate terminal, since the interactive login can't run inside Claude's shell.
- Cache for instant screens: persist TanStack Query state to AsyncStorage, then refresh from Supabase. Pin AsyncStorage to the Expo SDK version with `npx expo install`.
- One call per screen where possible. The course saw about 500 ms cut from one phone screen by combining several database calls into one. Use an RPC that returns what the screen needs.

## AI features

- LazyChef's AI features use Groq today (see PROGRESS.md), not the Claude API. The architecture is the same: app, Edge Function, provider, database row, then the app and a push.
- Copy rules: no em dashes; emojis only in titles; nudges one or two sentences; longer reflections only where the screen calls for them.
- Review sample outputs before hard-coding a prompt.
- Ask for notification permission when the user first sets a reminder, not at launch.

## Testing additions

- In dev builds, show an in-app toast in place of a push. Local builds can't receive real pushes.
- Ask Claude to run a browser check with devtools on each page: screenshot it, check the console for errors and the layout for overflow, then report the problems.

## Working method additions

- Run `/compact` around 250k to 300k tokens. In the video, performance dropped noticeably past about 200k. A fresh session per feature branch (already the repo rule) keeps context small.
- Commit often and push. Version history makes it easy to roll back an AI change that broke something.
- The permission-prompt setting is a personal choice. Whatever is chosen, the repo rules still apply (no pushes to `main`, no PRs from workers).
- Expo's tunnel can suspend an account after several uses and ask for email verification. Use the local network (same Wi-Fi) by default, and the tunnel only when needed.
