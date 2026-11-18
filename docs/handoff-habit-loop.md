# Handoff: cook-at-home habit loop (reward, goals, challenges, leaderboard)

## Context
Audit against the "good app design" checklist said LazyChef has a real core loop (add food, find recipe, "I cooked this",
list, put away) but no reward and no reason to come back. This adds a habit layer on top of the existing loop instead of
a new product: the habit is **cooking at home**, the reward lands at "I cooked this", and an unfinished state (weekly ring
plus a challenge) pulls people back.

Decisions from the user:
- Habit: cook at home.
- Structure: one personal weekly goal + tiers + one rotating challenge at a time. No fully custom habits.
- Reward: haptic + animation on every cook, confetti and stronger haptic only on milestones.
- Social: household leaderboard, weekly AND all-time. Personal goal per person.
- First challenges: "Cook 3 days in a row" and "Try something new".
- Pro: all core free (goal, ring, haptics, streak, challenges, leaderboard). Pro extras: history past 12 weeks, custom
  tiers, extra challenge packs.
- Surface area stays at 5 screens: Pantry, Recipes, List, Activity, Household. Everything new is a card, sheet, or tab.
- Models: W1 (push) and W6 (migration, RLS, onboarding) on Opus. W2, W3, W4, W5, W7 on Sonnet. 0a audit on Haiku.

## Phase 0: surface area (no database changes)
Run Prompt B from `docs/handoff-retention-and-surface-area.md` (PR #55) with one change: its "pick up where you left off"
strip becomes this plan's **"This week" card** (built by W5), so Pantry has ONE unfinished-state card.
Final screens: Pantry, Recipes (Ideas | Saved | Ours, recipe form as a sheet), List, Activity (Log | Chart | Board),
Household (goal, members, Pro). Old URLs (`/pantry/add`, `/recipes/saved`, `/recipes/ours`, `/activity/stats`, `/pro`)
redirect.

## Which agent does what
| # | Part | Agent | Notes |
|---|---|---|---|
| 0a | Serves-the-loop audit | Explore, read-only | Feeds W2. |
| W1 | Push notifications (Prompt A in the PR #55 doc) | general-purpose, worktree, Opus | Owns the migration slot first. |
| W2 | Trim to 5 screens (Prompt B, Part 1 only) | general-purpose, worktree, Sonnet | Must merge before W4 and W5. |
| W3 | Reward core: haptics, `reward.ts`, `useReward()`, cook reward, top banners | general-purpose, worktree, Sonnet | Parallel with W1/W2. |
| 1a | Phase 2 schema design | Plan | Runs while W1 to W3 build. |
| W4 | Activity Log / Chart / Board | general-purpose, worktree, Sonnet | After W2 merges. |
| W5 | Pantry "This week" card | general-purpose, worktree, Sonnet | After W2 and W3 merge. |
| W6 | Phase 2 migration, goals, challenges, quick log, onboarding | general-purpose, worktree, Opus | After W1, W4, W5 merge. |
| W7 | Phase 3 push nudges | general-purpose, worktree, Sonnet | After W1 and W6 merge. |
| R | Review each branch (`/code-review`, then `/simplify`) | Lead | |

Order (never more than 3 workers):
1. Now: 0a + W1 + W2 + W3, with 1a alongside.
2. When W2 merges: W4. When W2 and W3 both merge: W5.
3. When W1 (and W4/W5) merge: W6.
4. Last: W7.

## What already exists (reuse, do not rebuild)
- Cook log: `public.activity_log`, action `cooked`, one row per deducted ingredient grouped by `batch_id`, `details` has
  `recipe_id` and `recipe_title` (`supabase/migrations/20260930000100_cook_mode.sql`).
- Stats: `src/features/activity/stats.ts` `computeStats(rows, now, timeZone)`, `cookingStreak(days, today)`, 12-week
  `weeks`, per-person `people`. Rows from `getStatsRows` in `src/features/activity/queries.ts` (5000 row cap).
- Cook completion: `src/features/recipes/components/cook-sheet.tsx` `confirm()` success branch, `CookDone` view.
- Native detection: `src/lib/native/platform.ts`. Only haptic today is `navigator.vibrate(60)` in the barcode scanner.
- Onboarding: `src/features/welcome/components/welcome-flow.tsx`, draft in `src/features/preferences/draft.ts`, saved by
  `first-run-sync.tsx` via `set_my_preferences`.
- Realtime: `private.broadcast_household_change(col)`; `useHouseholdChanges()` on the client.
- Pro gating: `src/features/pro/plans.ts`, `pro-provider.tsx`, `paywall.tsx`. Toasts: sonner.

## Risks
- Leaderboards can demotivate the lowest person: weekly reset, last week's winner, personal ring is the headline.
- Haptics need a real device test.
- Week boundaries and streak days use the user's timezone.
- `getStatsRows` caps at 5000 rows; all-time totals should move to a SQL count in Phase 2 if households get big.
- Zero-deduction cooks leave no row today; fixed in Phase 2 or the ring undercounts.

---

# Handoff prompts

W1 (push notifications) uses Prompt A from `docs/handoff-retention-and-surface-area.md`, unchanged.

## Shared preamble (paste above EVERY worker prompt below)

```
PROJECT: LazyChef, a shared-household pantry tracker + recipe finder (Next.js 16 App Router, React 19, Tailwind v4 + shadcn,
Supabase, Capacitor iOS/Android shell, repo qujo1028/lazychef). Mobile-first. We are adding a "cook at home" habit layer.

SETUP
- Run `git fetch origin`. Create a git worktree based on origin/main on the branch named in your prompt. Never base on a stale local
  main. First check origin/main to see whether your feature already exists.
- Commit to your own branch. NEVER push to main. NEVER open a PR. The lead session does that.
- Read /AGENTS.md and /CLAUDE.md first. This Next.js has breaking changes: read the relevant guides in node_modules/next/dist/docs/
  before writing routing, caching, redirect, or server action code. Middleware is src/proxy.ts.
- Conventions: every household table has household_id and RLS via private.is_member(household_id). Privileged or multi-step writes
  go through security definer functions in public with `set search_path = ''`, EXECUTE revoked from anon/public, auth.uid() checks.
  Server actions re-check auth with requireViewer(). Keep API keys server-only. src/types/database.ts mirrors the migrations.
- ONLY the worker whose prompt says so may touch supabase/migrations/ or src/types/database.ts. If you think you need a schema
  change and your prompt does not allow it, stop and tell the lead.
- Style: plain, short, friendly UI copy. No em dashes anywhere (code, comments, copy, commits). Touch targets stay large (shadcn
  "nova"). Check every UI change at 375px width and desktop. Respect prefers-reduced-motion.
- Put pure logic in its own module with unit tests (vitest, `npm run test`), separate from React.
- Before reporting done run: npm run typecheck && npm run lint && npm run test (+ npm run test:db if you touched the DB) and
  npm run build for UI work. Show passing output.
- Browser check with the preinstalled Playwright/Chromium (require('playwright'), no install). Save screenshots in your scratchpad,
  never in the repo. If you cannot sign in to a real account, say what you could and could not verify.
- FINAL REPORT: branch name, what you built, files added/changed (short), what you could not verify, decisions you made, anything
  that surprised you. Do not merge.

HABIT DESIGN CONSTANTS (use these exactly so parallel workers agree)
- Habit: cook at home. One "cook" = one distinct batch_id of activity_log rows with action 'cooked' (see
  supabase/migrations/20260930000100_cook_mode.sql), attributed to actor_id. details jsonb has recipe_id and recipe_title.
- Week starts Monday in the viewer's timezone (computeStats in src/features/activity/stats.ts already takes timeZone).
- Personal weekly goal: nights per week, 1 to 7, default 3 (export as DEFAULT_GOAL from src/features/habit/constants.ts).
- Weekly tiers by cooks that week: Bronze 2, Silver 4, Gold 6 (independent of the goal; the ring target is the goal).
- Streak: days in a row with a cook (reuse cookingStreak in src/features/activity/stats.ts as the base). Forgiveness: one missed day
  per Monday-week is forgiven. Milestones at 3, 7, 14, 30 days.
- Challenges (one active at a time): "streak3" = cook 3 days in a row. "try_new" = cook a recipe (by details.recipe_id) this user has
  never cooked before.
- Reward kinds: "cook" (small: light haptics + ring/flame animation) and "milestone" (big: confetti + escalating haptics), used for
  tier-ups, streak milestones, and finished challenges only.
```

## Prompt 0a: serves-the-loop audit (Explore agent, read-only)

```
Read-only audit of the LazyChef repo. Do not edit anything. Medium thoroughness. Context: we are checking the app against this
design checklist: core function in one sentence, core loop repeatable in under 30 seconds, "accessory features: add only what
supports the loop, if it does not serve the loop, cut it", max 5 to 7 screens, a retention hook. The core loop is: add food to the
pantry, see recipes you can make, "I cooked this" (pulls items from the pantry), missing items go on the shopping list, "Put away"
refills the pantry. The new habit is "cook at home".

Task: list EVERY user-facing route under src/app (ignore src/app/(admin), api, auth callback, legal, join/[code], and pre-login
auth pages) and every notable feature/section/sheet reachable from them (look in src/features/*/components). For each, output one
row: route or feature | what it does | which step of the core loop it serves (or "none") | verdict KEEP / MERGE INTO <place> / CUT |
one-line reason. Pay special attention to: /pantry/add, /recipes/saved, /recipes/ours, /recipes/new, /recipes/[id]/edit,
/activity/stats, /pro, /household, barcode scanning, AI ideas, substitutions, ratings, account/preferences screens.
Also report: how many distinct full-page screens exist today, and the smallest set that still contains everything marked KEEP
(target 5: Pantry, Recipes, List, Activity, Household). Flag anything that would break if merged (deep links in
src/app/manifest.ts, src/lib/native-app.ts, emails, docs). Under 700 words, as a table plus a short list of risks.
```

## Prompt 1a: Phase 2 schema design (Plan agent, no edits)

```
Design (do not implement) the Phase 2 database changes for LazyChef's habit layer. Read first: supabase/migrations/
20260930000100_cook_mode.sql (how cooks are written to activity_log, and whether a cook that deducts nothing leaves any row),
20260928000200_pantry.sql (activity_log, private.log_pantry_activity), 20261109164357_user_preferences.sql (per-user RLS pattern),
20261108000100_account_deletion.sql (what account deletion covers), 20261003000100_security_hardening.sql, and supabase/tests/
harness.mjs + user-preferences.test.mjs. Also src/features/recipes/cook.ts and the cookRecipe/undoCook server actions.

Needs:
1. habit_goals (user_id pk, nights_per_week 1..7 default 3, reminder_time, active_days (weekdays that count), updated_at). Own-row RLS,
   set via an RPC set_my_habit_goal.
2. challenges (id, user_id, household_id, kind in ('streak3','try_new'), status active|completed|expired, started_at, completed_at).
   At most one active per user (partial unique index). Progress is DERIVED from cook history, never stored. RPCs to start, complete,
   expire.
3. A reliable cook record: make sure EVERY cook (including one that deducts no items) produces exactly one countable cook for the
   cooking user, and undoCook removes it. Propose the smallest change (e.g. always write one 'cooked' row per batch, or a cook_events
   table) and justify it.
4. Quick log: RPC log_quick_cook() that records a cook with no recipe (details.recipe_id null), counted for ring/streak/tiers/
   leaderboard but NOT for "try_new".
5. RLS: housemates can read each other's cook counts (needed for the leaderboard) but nobody can read another user's goal row or
   challenges unless you argue they should (leaderboard shows cooks only).
6. Realtime: which tables need private.broadcast_household_change triggers.
7. Account deletion coverage, indexes for per-user per-week cook queries, and the exact list of RLS tests to write.
Output: the SQL outline (tables, columns, constraints, indexes, function signatures with grants), the test list, the
src/types/database.ts changes, and the migration order/timestamp advice given that the push-notification migration may land first.
Keep it under 900 words. List open questions for the lead rather than guessing.
```

## Prompt W2: trim to 5 screens (branch `feature/trim-screens`)

```
[Paste the shared preamble above this.]

This is Prompt B from docs/handoff-retention-and-surface-area.md (read it in full), with ONE change: do PART 1 (surface area) only.
SKIP Part 2 (the "pick up where you left off" strip). A later worker builds a richer "This week" card on Pantry; do not build a
placeholder, but leave the top of the Pantry page uncluttered so it can slot in above the list.
Also read the output of the serves-the-loop audit if the lead pasted it below, and follow its KEEP/MERGE/CUT verdicts where they
conflict with the proposed map in Prompt B; explain every difference in your report.
Final screens: Pantry, Recipes (Ideas | Saved | Ours as ONE screen, recipe create/edit as a sheet or shared form), List,
Activity (segmented control "Log | Stats" for now; a later worker renames and extends it to "Log | Chart | Board"), Household (also
hosts Pro). Never break an old URL: /pantry/add, /recipes/saved, /recipes/ours, /activity/stats, /pro all redirect. Update every link,
manifest shortcuts, native deep links (src/lib/native-app.ts), README and docs. No database changes.
Branch: feature/trim-screens. Report the final screen list with the count and the redirect map.
```

## Prompt W3: reward core (branch `feature/habit-reward`)

```
[Paste the shared preamble above this.]
No database changes.

GOAL: make "I cooked this" feel good. A satisfying, choreographed haptic + animation reward on every cook, a bigger milestone
reward, and in-app drop-down banners.

READ FIRST: src/features/recipes/components/cook-sheet.tsx (confirm() success branch, setDone, the CookDone view),
src/features/recipes/cook.ts, src/lib/native/platform.ts (getNativePlatform, useNativePlatform), src/features/barcodes/components/
barcode-scanner.tsx (navigator.vibrate(60)), src/components/ui/sonner.tsx and src/app/layout.tsx (toast setup),
src/features/household/components/household-channel.tsx (useHouseholdChanges and the realtime channel), src/features/activity/
feed.ts, src/features/household/components/member-list.tsx, package.json (Capacitor major).

BUILD
1. `npm install @capacitor/haptics` (version matching the installed @capacitor/core major). Do not edit ios/ or android/ by hand; note
   in the report that the lead must run `npx cap sync`.
2. src/lib/native/haptics.ts: `haptic(kind: "tap" | "light" | "rise" | "success" | "milestone")`. Native uses the plugin
   (impact light/medium/heavy, notification success). Web falls back to navigator.vibrate with try/catch (iOS Safari does nothing,
   that is expected). Reads an on/off setting from localStorage (try/catch, default ON). No-ops on the server and when
   prefers-reduced-motion is set. Replace the ad hoc vibrate in the barcode scanner with haptic("tap"). Unit test the fallback logic
   and the on/off gating with mocks.
3. src/features/habit/reward.ts (pure) + use-reward.ts (hook): a timeline of beats, e.g. kind "cook" = [{at:0, haptic:"light"},
   {at:120, haptic:"light"}, {at:260, haptic:"rise", visual:"ring"}, {at:420, haptic:"success", visual:"flame"}] and kind
   "milestone" = three escalating taps + confetti burst. `useReward()` returns `play(kind)`; it schedules haptics and sets visual
   state so animation and haptics share ONE clock and never drift. Skips everything under reduced motion or when haptics are off
   (visual-only then, still short). Unit test the timelines and cancellation (play twice, unmount mid-play).
4. Visuals: a small `RewardBurst` component (ring fill + flame tick for "cook", confetti for "milestone"). Confetti must be tiny:
   CSS or a small canvas routine, no heavy dependency. Keep it under ~150ms of main-thread work per frame.
5. Wire the cook reward into CookDone / the confirm() success branch in cook-sheet.tsx: play("cook") exactly once per successful cook
   (not on Undo, not on error, not on re-render). Also haptic("tap") on list check-off and haptic("success") when Put away finishes
   (put-away-sheet.tsx finish()). Do NOT add rewards to other places.
6. Top drop-down banners: configure/extend sonner (or a thin wrapper `showBanner({title, body, tone, icon})`) to slide down from the
   top, auto dismiss ~4s, tap to dismiss, safe-area aware (iOS notch), reduced-motion safe. Use it for live housemate cooks: via
   useHouseholdChanges(), when an activity_log row with action 'cooked' arrives from another member, show "<Name> just cooked
   <Recipe>". Rate limit: at most 1 housemate banner per 5 minutes and dedupe by batch_id. Never show banners for your own actions.
   Look up the member's display name from data the client already has; do not add queries that bypass RLS.
7. A `HapticsToggle` component (a switch labeled "Haptics"). No other settings. If origin/main already has the merged
   Household screen, mount HapticsToggle there; otherwise export it and say so in your report.

DONE WHEN: a cook plays the sequence once, Undo and errors do not, banners show for housemate cooks only and are rate limited,
tests pass, 375px screenshots of the cook done view mid-animation. Say clearly that real haptics need a device test.
```

## Prompt W4: Activity Log / Chart / Board (branch `feature/habit-board`)

```
[Paste the shared preamble above this.] No database changes. START ONLY AFTER W2 (trim) IS MERGED INTO origin/main; if it is not,
stop and tell the lead.

GOAL: Activity becomes the "look back" screen: segmented control Log | Chart | Board.
READ FIRST: src/features/activity/ (queries.ts getStatsRows with its 5000 row cap, stats.ts computeStats/cookingStreak, feed.ts,
components/stats-view.tsx, components/activity-tabs.tsx), src/components/user-avatar.tsx, src/features/household/components/
member-list.tsx, src/features/household/components/household-channel.tsx, src/app/(app)/activity/**.

BUILD
1. URL-driven view state (?view=log|chart|board, default log) so the page stays a server component and deep links work.
   /activity/stats (already redirected by W2) lands on view=chart.
2. Log: the existing feed, unchanged.
3. Chart: the existing 12-week chart and streak from stats-view.tsx, PLUS a calendar heatmap of cook days for the last 16 weeks
   (Monday start, viewer timezone). Accessible: a text summary ("Cooked on 12 of the last 28 days") and per-cell labels for screen
   readers. Use design tokens, light and dark. Pure `heatmap.ts` (cells from rows) with tests including timezone and DST edges.
4. Board: pure `src/features/habit/leaderboard.ts` returning, for the household, weekly cooks and all-time cooks per member, the
   current rank, "last week's winner", and tie handling (ties share a rank, order by all-time then name). One cook = one batch_id.
   UI: two toggles Weekly | All time, avatar + name + cook count + a small bar, your own row highlighted, a crown on last week's winner,
   a "resets Monday" hint. Households with one member show an empty state with an invite button instead of a board. Do not shame the
   last place (no red, no "last"). Live updates through useHouseholdChanges() so a housemate's cook reorders the board.
5. If all-time totals could exceed the 5000 row cap, show "5000+" honestly or fetch a count; document the choice. Do not silently
   undercount.
6. Tests for leaderboard.ts and heatmap.ts. Do not duplicate cookingStreak or computeStats; import them.

DONE WHEN: three tabs work on 375px and desktop, board updates when a second account cooks (or explain how you verified), tests green.
```

## Prompt W5: Pantry "This week" card (branch `feature/habit-week-card`)

```
[Paste the shared preamble above this.] No database changes. START ONLY AFTER W2 (trim) AND W3 (reward core) ARE MERGED INTO
origin/main; if not, stop and tell the lead.

GOAL: the unfinished-state card at the top of /pantry. ONE card, server-rendered (no layout shift, no flash), that always shows
something to finish.
READ FIRST: src/app/(app)/pantry/page.tsx, src/features/pantry/components/pantry-view.tsx and pantry-sections.tsx, src/features/pantry/
dates.ts (expiryInfo, do not re-implement date math), src/features/activity/stats.ts, src/features/activity/queries.ts,
src/features/recipes/ (match.ts, queries.ts, cache-core.ts: the shared hourly Spoonacular cache), the W3 files (use-reward.ts,
reward.ts), src/features/recipes/components/cook-sheet.tsx and the cookRecipe server action.

BUILD (pure modules first, each with unit tests)
- src/features/habit/constants.ts: DEFAULT_GOAL = 3 in ONE place (a later worker swaps it for the stored goal).
- week.ts: cooks this week for the viewer (batch_id grouping, Monday start, timezone). tiers.ts: Bronze/Silver/Gold + a function
  `cookMilestone(before, after)` returning null | {kind:"tier"|"streak"|"challenge", ...}. streak.ts: streak with one forgiven missed
  day per Monday-week, milestones 3/7/14/30 (wrap cookingStreak, do not fork it). challenges.ts: DERIVED progress for streak3 and
  try_new (nothing is persisted yet; the "active" challenge is the first one not yet completed this week). nudges.ts: priority
  picker for what the card says.
- UI: `WeekCard` with a progress ring (SVG, accessible name "2 of 3 cooks this week"), tier medal, streak flame, and the challenge row
  ("2 of 3 nights"). Below it up to two nudge lines, in priority order, only those that apply: (a) expiring soon (reuse the existing
  Expiring soon data), (b) "1 ingredient away from <Recipe>" from the CACHED recipe result only (no new Spoonacular or AI calls on
  pantry load; show nothing if no cache), (c) comeback: 3+ days since last cook -> "Welcome back. Start a 3-day challenge" instead of a
  broken streak, (d) first cook: household has never cooked and a "Make now" recipe exists -> "Cook your first meal: <Recipe>".
- Extend the cookRecipe server action result with a `habit` object ({cooksThisWeek, tierBefore, tierAfter, streakBefore, streakAfter,
  milestone}) computed with the same pure modules, and in cook-sheet.tsx call useReward().play("milestone") when milestone is
  non-null (play "cook" otherwise, exactly as W3 does; never both).
- Dismissible nudges for the day (localStorage in try/catch; must render correctly without it). The card renders even with no data
  (new household shows the first-cook state).
- Live: the ring updates through useHouseholdChanges() when the viewer cooks on another device.

DONE WHEN: Pantry shows the card in four states (new household, mid week, tier just earned, comeback), no layout shift, no extra
network calls to Spoonacular or the AI, tests green, 375px screenshots of all four states.
```

## Prompt W6: goals, challenges, quick log, onboarding (branch `feature/habit-db`)

```
[Paste the shared preamble above this.] YOU OWN supabase/migrations/ AND src/types/database.ts FOR THIS BRANCH. START ONLY AFTER
W1 (push notifications) IS MERGED INTO origin/main (its migration must come first, pick a LATER timestamp) AND W4/W5 ARE MERGED.
The lead will paste the output of the schema design (Prompt 1a) below; follow it, and flag anything you disagree with.

GOAL: make the habit personal and persistent.
READ FIRST: the design output below, supabase/migrations/20260930000100_cook_mode.sql, 20261109164357_user_preferences.sql,
20261108000100_account_deletion.sql, supabase/tests/harness.mjs, src/features/welcome/components/welcome-flow.tsx (steps,
LAST_STEP, ?step=), src/features/preferences/ (draft.ts, use-draft.ts, first-run-sync.tsx, actions.ts), src/app/(app)/household/
page.tsx, src/features/pro/plans.ts (ProFeature, FEATURE_HEADLINES), paywall.tsx, pro-provider.tsx, and the W4/W5 habit modules.

BUILD
1. ONE migration: habit_goals, challenges, the reliable-cook-record fix, log_quick_cook() RPC, set_my_habit_goal RPC, challenge
   start/complete/expire RPCs, RLS, grants (revoked from anon/public, auth.uid() checks, search_path = ''), indexes, realtime triggers
   where needed, account deletion coverage. supabase/tests/habit.test.mjs covering: cross-user goal and challenge isolation, RPC grants,
   one active challenge per user, quick log counts for the ring but not for try_new, undoCook removes exactly one cook, deletion
   cleanup. `npm run test:db` must pass. Update src/types/database.ts. Do not apply the migration to Supabase; tell the lead the
   filename.
2. Swap DEFAULT_GOAL for the stored goal everywhere (week card, ring, tiers target). Honor active_days in the week and streak
   functions (pure, tested). Persist challenges: start the first one automatically after the first cook or from the card, mark
   complete (fire the milestone reward), expire after 7 days with friendly copy, then offer the next.
3. Quick log: a "I cooked something" button on the Pantry card and in the Add sheet, one tap, calls the RPC, plays the "cook" reward,
   shows an Undo toast.
4. Onboarding: new welcome step "How many nights a week do you want to cook?" (1 to 7, default 3, skippable) stored in the draft
   and saved by FirstRunSync after sign-in (follow the existing preference-saving flow). Update LAST_STEP and the step URLs; Back
   must still work. Then land new users on Pantry with the first-cook state visible.
5. Household screen: goal editor, reminder time, active days (weekday chips), Haptics toggle if not already mounted.
6. Pro extras (small): add ProFeature values for "habit-history" (heatmap/chart beyond 12 weeks) and "custom-tiers"; gate with the
   existing paywall pattern and FEATURE_HEADLINES. Everything else stays free.
No push notification code here (that is W7).

DONE WHEN: migration + tests green, goal changes move the ring live, a quick log and a normal cook both count, onboarding creates the
goal end to end (sign up fresh, pick 4, see ring target 4), typecheck/lint/test/test:db/build green.
```

## Prompt W7: retention nudges via push (branch `feature/habit-push`)

```
[Paste the shared preamble above this.] YOU OWN a small migration for this branch (notification prefs columns only). START ONLY AFTER
W1 (push) AND W6 (habit DB) ARE MERGED INTO origin/main; if not, stop and tell the lead.

GOAL: bring people back with timely, kind nudges, each with an on/off switch.
READ FIRST: src/lib/push/ (sender, deliver.ts, dedupe via notification_log), src/app/api/push/expiring/route.ts (cron auth, local
time window logic), the notification_prefs migration and the Household notifications card from W1, src/features/habit/ (week.ts,
streak.ts, challenges.ts, leaderboard.ts), vercel.json.

BUILD
1. Migration: add `habit` and `social` boolean columns (default true) to notification_prefs, update the types and tests.
2. Pure message builders with tests (src/features/habit/nudges-push.ts): "Your streak ends tonight, one cook keeps it" (only if it is
   at risk and the user has not cooked today, sent once at the user's local early evening), "1 more night to finish your challenge"
   (challenge at target minus 1), "<Name> took the lead this week" (social, sent to the person who lost the lead, once per week
   change), "Welcome back" (3+ days quiet, at most once per 7 days). Copy is warm, never guilt-trippy. No em dashes.
3. Cron route src/app/api/push/habit/route.ts authenticated exactly like the expiring cron, using each user's timezone from
   device_tokens. Dedupe through notification_log keys (e.g. habit:streak:<local date>). The took-the-lead push fires from the cook
   server action inside after() (check the bundled Next docs), comparing leaderboard before and after.
4. Switches in the Notifications card on Household: "Habit reminders" and "Housemate activity".
5. Never fail a user action because a push failed. No tokens or emails in logs.

DONE WHEN: unit tests for every builder including timezone edges, cron rejects missing secret (test), prefs respected, checks green.
Real delivery needs APNs/FCM credentials; say so.
```
