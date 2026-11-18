# Handoff: retention hook + surface area trim

Context: I (the lead) audited LazyChef against the "What good app design looks like" checklist
(core function, core loop, accessory features, surface area, retention hook). It passed the first three. Two gaps:

1. **Retention hook is weak.** There is an "Expiring soon" section, a cooking streak, and "Make now" recipes, but
   nothing pulls people back in. Push notifications exist only as a TODO in `docs/app-store-launch.md`
   (no `device_tokens` table, no sender, no plugin in `package.json`).
2. **Surface area is a bit high.** About 14 user-facing routes vs the 5 to 7 target. The bottom nav is only 4 tabs,
   and Recipes and Activity already use `SectionTabs`, so some of this is smaller than it looks.

This doc has a plan, then two self-contained prompts (Workstream A and B). They are independent and can run in
parallel in separate worktrees. Only A touches `supabase/migrations/` and `src/types/database.ts`, which matches the
rule in `CLAUDE.md` (one branch at a time may change those).

---

## Plan

### Ground rules (both workstreams)
- Run `git fetch origin` first. Base your worktree on `origin/main`, never local `main`. Check whether the feature
  already exists on `origin/main` before building.
- Commit to your own branch. Do NOT push to `main`, do NOT open a PR. The lead does that.
- Before reporting done: `npm run typecheck && npm run lint && npm run test` (plus `npm run test:db` for A).
- Read `AGENTS.md` first. This is NOT the Next.js you know. Read the relevant guides in
  `node_modules/next/dist/docs/` before writing routing, caching, or cron code. Middleware is `src/proxy.ts`.
- Follow the conventions in `CLAUDE.md`: RLS via `private.is_member(household_id)`, security definer functions in
  `public` with `set search_path = ''`, EXECUTE revoked from `anon`/`public`, `auth.uid()` checks, server actions
  re-check auth with `requireViewer()`, keep API keys server-only.
- UI is mobile-first with enlarged touch targets (shadcn "nova"). Check at 375px width.
- Copy style: plain, short, friendly. No em dashes anywhere (code comments, UI copy, commit messages).

### Workstream A: push notifications (owns the DB + native work)
Goal: a user gets a push when (1) something in their household pantry expires soon, (2) a housemate changes the
shopping list, (3) someone joins their household. Each type has an on/off switch.

Phases:
1. Migration + RLS tests: `device_tokens`, `notification_prefs`, `notification_log` (dedupe).
2. Server sender: APNs (iOS) and FCM (Android), behind an interface so tests can inject a fake.
3. Triggers: daily expiring-soon job (cron), list-change push from the server actions, join push.
4. Client: register for push (Capacitor), save token, settings UI with toggles, handle tap deep links.
5. Cleanup paths: remove token on sign-out, delete on account deletion, drop dead tokens when APNs/FCM says so.
6. Docs: update `docs/app-store-launch.md` and `docs/mobile-apps.md`, add env var names to `.env.example`.

### Workstream B: trim screens + a visible "unfinished" state on Pantry
Goal: user-facing screens at or under 7, and the Pantry home always shows something unfinished so there is a reason
to come back (this is the in-app half of the retention hook; A is the out-of-app half).

Phases:
1. Inventory every route and decide the final map (proposal below, confirm against the code).
2. Merge/redirect routes. Keep old URLs working with redirects (deep links, bookmarks, emails, push taps).
3. Add a "Pick up where you left off" strip on Pantry: expiring items, an "Almost there" recipe nudge, the streak.
4. Update tests, nav highlighting, loading/error files, links.

### Decisions I need from the user (the agent should ask, not guess)
- A: Vercel plan and cron frequency (see prompt A, "Scheduling"). The existing cron in `vercel.json` is daily.
- A: Do they have an Apple APNs `.p8` key and a Firebase project yet? The agent can build everything and test with a
  fake sender, but real delivery needs these. Never put them in the repo or in chat. Use env vars.
- B: OK to fold Pro into the Household page, and Stats into Activity? (Recommended yes.)

---

## Prompt A: push notifications

> Copy everything in this block into the new agent session.

```
You are building push notifications for LazyChef (shared-household pantry tracker + recipe finder).
Repo: qujo1028/lazychef. Work in a git worktree based on origin/main on a new branch named
`feature/push-notifications`. Run `git fetch origin` first and confirm push notifications do not already exist on
origin/main (grep for device_tokens, push-notifications, apns). Commit to your branch only. Do NOT push to main and
do NOT open a PR; the lead session does that.

READ FIRST, before writing any code:
1. /AGENTS.md and /CLAUDE.md. Next.js here is a newer major version with breaking changes. Read the relevant docs in
   node_modules/next/dist/docs/ (route handlers, cron/route config, server actions, caching) before using them.
   Middleware is src/proxy.ts, not middleware.ts.
2. docs/app-store-launch.md (the push notification bullets and the Guideline 4.2 section) and docs/mobile-apps.md
   (how the Capacitor shell loads the hosted Vercel site; the app is NOT a static export).
3. Existing patterns to copy, not reinvent:
   - supabase/migrations/20261109164357_user_preferences.sql (per-user prefs + RLS)
   - supabase/migrations/20261110082751_ai_rate_limit.sql and 20261118041804_ai_free_allowance.sql (security
     definer functions, revoked grants)
   - supabase/migrations/20261108000100_account_deletion.sql (account deletion; your tables MUST be cleaned up here)
   - supabase/migrations/20261003000100_security_hardening.sql
   - supabase/tests/harness.mjs and supabase/tests/user-preferences.test.mjs (how RLS tests are written)
   - src/app/api/admin/snapshot/route.ts and vercel.json (the existing cron route and how it authenticates)
   - src/lib/native/platform.ts, src/lib/native-app.ts, src/components/native-app-bridge.tsx (native detection and
     bridge)
   - src/features/preferences/ (how per-user settings are stored, edited, and drafted)
   - src/features/pantry/dates.ts (expiryInfo, date handling), src/features/pantry/queries.ts
   - src/features/list/ (list actions), src/features/household/actions.ts (join/invite flow)
   - src/app/(app)/household/page.tsx (where settings UI lives today)

GOAL
A signed-in user on the iOS or Android Capacitor app can receive three kinds of push notifications, each with its own
on/off switch that defaults to ON for expiring and list changes and ON for joins:
  1. "expiring": "Milk expires tomorrow" / "3 things in your pantry expire in the next 2 days". Sent at most once
     per household member per day, only if something is expiring and not already ran out.
  2. "list": "Sam added Milk to the shopping list". Sent to housemates EXCLUDING the person who made the change.
     Must be rate-limited so adding 10 items in a row yields one push, not ten (see Triggers).
  3. "joined": "Sam joined your household". Sent to existing members, not to the joiner.
Tapping a push deep-links to the right screen (/pantry for expiring, /list for list, /household for joined).

NON-GOALS: web push, email, SMS, in-app notification center, per-item snooze. Do not touch the admin dashboard.

DESIGN (follow unless you find a concrete reason not to, and say so in your final report)

1. Migration (ONE new file, timestamp later than the newest in supabase/migrations/). You are the only branch allowed
   to touch supabase/migrations/ and src/types/database.ts right now.
   - `device_tokens`: id uuid pk, user_id uuid references auth.users on delete cascade, platform text check in
     ('ios','android'), token text not null, timezone text not null default 'UTC' (IANA name), app_version text
     null, created_at, last_seen_at. Unique (token). RLS: a user can select/delete their own rows only. Writes go
     through a security definer function `public.register_device_token(p_token, p_platform, p_timezone, p_app_version)`
     that upserts and reassigns the token to the calling user (a token can move between accounts on a shared phone).
     Revoke EXECUTE from anon/public, check auth.uid() is not null, set search_path = ''.
   - `notification_prefs`: user_id pk references auth.users on delete cascade, expiring bool default true, list bool
     default true, joined bool default true, updated_at. RLS: own row only. Add a security definer upsert function
     or use plain RLS insert/update (match whatever user_preferences does).
   - `notification_log`: for dedupe. user_id, kind text, dedupe_key text, sent_at; unique (user_id, kind,
     dedupe_key). No client access at all (RLS enabled, no policies; service role only). Example dedupe keys:
     `expiring:2026-11-20` (local date) and `list:<household_id>:<5-minute-bucket>`.
   - Sending uses the service role (SUPABASE_SECRET_KEY, already in env), never the user's session.
   - Update the account deletion function if the new tables are not covered by cascade. Verify with a test.
   - Add a test file supabase/tests/push-notifications.test.mjs covering: user A cannot read/modify B's tokens or
     prefs, register_device_token reassigns a token, anon cannot execute the function, notification_log is not
     readable by authenticated users, account deletion removes tokens and prefs. Run `npm run test:db`.
   - Update src/types/database.ts by hand to mirror the migration (or regenerate).
   - Tell the lead the migration file name. The lead applies it to Supabase; do not try to apply it yourself.

2. Sender (src/lib/push/):
   - `types.ts`: `PushMessage { title, body, url, kind }`, `PushSender { send(token, platform, message): Promise<
     { ok: true } | { ok: false, invalidToken: boolean, retryable: boolean, reason: string }> }`.
   - `apns.ts`: token-based auth (ES256 JWT from a .p8 key, cached for ~50 minutes, never longer than 60), HTTP/2 to
     api.push.apple.com (use node:http2), `apns-topic` = the iOS bundle id (read it from capacitor.config.ts / the
     Xcode project, do not hardcode a guess), `apns-push-type: alert`. Treat 410 Unregistered and 400 BadDeviceToken
     as invalidToken.
   - `fcm.ts`: FCM HTTP v1 with a Google service-account JWT exchanged for an access token (cache it). Treat
     UNREGISTERED / NOT_FOUND as invalidToken.
   - `index.ts`: `getSender()` picks by platform, and returns a no-op logger sender when credentials are missing, so
     local dev and preview deploys never crash. Server-only: put `import "server-only"` at the top of every file here
     that reads a secret.
   - Env vars (add NAMES ONLY to .env.example, never values): APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (the .p8
     contents, with escaped newlines handled), APNS_BUNDLE_ID, APNS_ENVIRONMENT ("production" | "sandbox"),
     FCM_SERVICE_ACCOUNT_JSON, CRON_SECRET (check how the existing snapshot route authenticates and reuse that).
   - `deliver.ts`: `deliverToUsers(userIds, message, { sender })` loads tokens with the service role, respects
     notification_prefs for message.kind, skips the actor, sends with bounded concurrency, deletes tokens flagged
     invalidToken, and never throws into the caller (a push failure must never fail a user action). Log failures with
     no token values and no email addresses.
   - Unit tests with a fake sender for: pref gating, actor exclusion, invalid-token cleanup, per-send failure
     isolation, dedupe via notification_log.

3. Triggers:
   - Expiring: new route `src/app/api/push/expiring/route.ts`, authenticated exactly like the admin snapshot cron.
     For each household member with a token, compute their LOCAL date from device_tokens.timezone, find pantry
     items with expires_on within [today, today+2] that are not marked ran out (reuse expiryInfo from
     src/features/pantry/dates.ts, do not re-implement date math), build one message per user, dedupe with
     `expiring:<local date>`. Only send during the user's local window of roughly 17:00 to 18:59, so run the cron
     hourly. Copy: one item -> "<Name> expires <today|tomorrow|in 2 days>"; many -> "<N> things in your pantry
     expire soon". Put the pure message/selection logic in a separate testable module with unit tests, including
     timezone edge cases (user at UTC+13, user at UTC-11, DST change day).
   - SCHEDULING: vercel.json currently has one daily cron. Vercel's Hobby plan limits crons to once per day; hourly
     needs Pro. Check which plan the project is on (ask the lead). If hourly is not allowed, fall back to a single
     daily run and send for every user whose local time is between 08:00 and 23:00 at that moment, or ask the lead
     which tradeoff they want. Do not silently choose; state it in your report.
   - List changes: after a successful add/check-off/remove in src/features/list/ actions (read the actual files to
     find the right choke point), call `notifyListChange(householdId, actorId, count)` inside `after()` from
     next/server (confirm the API in the bundled Next docs) so the response is not blocked. Batch with
     notification_log: insert a row with key `list:<household_id>:<actor>:<5-minute-bucket>` (the unique index makes
     this atomic). If the insert succeeds, send right away. If it conflicts, skip. We can't delay-and-merge on
     serverless, so the push says what the first change was (e.g. "Sam added Milk"), not a final count. Only
     "added" events notify, not check-offs, not "Put away".
   - Joined: in the join flow in src/features/household/actions.ts, notify existing members after a successful join.

4. Client (Capacitor):
   - `npm install @capacitor/push-notifications` (pick the version matching the installed @capacitor/core major;
     check package.json). Then `npx cap sync` is the lead's/user's job; document it, do not commit generated native
     project churn beyond what is needed. Check how ios/ and android/ are tracked in git before touching them.
   - New `src/lib/native/push.ts`: `isPushSupported()`, `requestAndRegister()`, `unregister()`, listeners for
     `registration`, `registrationError`, `pushNotificationActionPerformed` (navigate with the Next router to
     data.url, but only if it is a same-origin relative path starting with "/" and not "//"; reject everything else).
   - Do NOT prompt for permission on first launch. Ask in context: after the user's first successful pantry add or
     first time they open the new settings card, with a short pre-prompt screen explaining the value ("Get a heads up
     before food goes bad"). If the OS permission is denied, show how to enable it in Settings instead of nagging.
   - Register the token through a server action that calls register_device_token with the device's IANA timezone
     (Intl.DateTimeFormat().resolvedOptions().timeZone). Re-register on each app open so last_seen_at and timezone
     stay fresh.
   - Settings UI: a "Notifications" card on /household (src/app/(app)/household/page.tsx) with three switches
     (expiring, list, joined) bound to notification_prefs, optimistic with error rollback, matching the existing
     card/switch components. Hide the card entirely on the plain website (not native).
   - On sign-out, unregister the token for this user (server action + plugin unregister). 

5. Deliverables checklist
   - [ ] migration + supabase/tests/push-notifications.test.mjs passing
   - [ ] src/types/database.ts updated
   - [ ] src/lib/push/* with unit tests
   - [ ] cron route + vercel.json entry + pure selection logic tests
   - [ ] list + joined triggers wired through after()
   - [ ] client registration, pre-prompt, settings card, deep-link handling
   - [ ] sign-out + account-deletion cleanup
   - [ ] .env.example (names only), docs/app-store-launch.md checkboxes updated, docs/mobile-apps.md has a
         "Push setup" section (Apple APNs key in the developer portal, Push Notifications capability in Xcode,
         Firebase project + google-services.json for Android, which env vars to set in Vercel)
   - [ ] `npm run typecheck && npm run lint && npm run test && npm run test:db` all green

SECURITY / PRIVACY
- Secrets are env vars only. Never log tokens, keys, or emails. Never commit .p8 or service-account JSON.
- Notification text may show on a lock screen: include item names only, never emails or full names beyond the
  housemate's display name that already appears in the Activity feed.
- The cron route must reject requests without the secret. Add a test.
- Deep link URLs from push payloads are untrusted; validate as described above.

WHEN DONE: commit on your branch (several small commits are fine), then reply with: the branch name, the migration
filename, what you could not test (real APNs/FCM delivery needs credentials), the cron frequency decision you made or
asked about, and anything that surprised you. Do not merge, push to main, or open a PR.
```

---

## Prompt B: trim screens + "unfinished" state

> Copy everything in this block into the new agent session.

```
You are reducing LazyChef's surface area and adding an "unfinished state" to the Pantry home. Repo:
qujo1028/lazychef. Work in a git worktree based on origin/main on a new branch `feature/trim-screens-and-pickup`.
Run `git fetch origin` first and check whether any of this already exists on origin/main. Commit to your branch only.
Do NOT push to main and do NOT open a PR; the lead does that.

HARD RULE: do not edit anything in supabase/migrations/ or src/types/database.ts. Another session owns those files
right now (push notifications). If you think you need a schema change, stop and tell the lead. Everything here should
be doable with existing queries.

READ FIRST
- /AGENTS.md and /CLAUDE.md. Next.js here is a newer major with breaking changes; read node_modules/next/dist/docs/
  for redirects, route groups, and `redirect()`/`permanentRedirect` before using them. Middleware is src/proxy.ts.
- src/components/app-shell/bottom-nav.tsx, src/components/section-tabs.tsx
- src/features/recipes/components/recipes-tabs.tsx, src/features/activity/components/activity-tabs.tsx
- src/app/(app)/ route tree (pantry, pantry/add, recipes, recipes/saved, recipes/ours, recipes/new,
  recipes/[id], recipes/[id]/edit, list, activity, activity/stats, household, pro)
- src/features/pro/components/pro-page.tsx and pro-card.tsx, src/app/(app)/household/page.tsx
- src/features/pantry/components/pantry-view.tsx, pantry-sections.tsx, src/features/pantry/dates.ts
- src/features/activity/stats.ts (cookingStreak) and src/features/recipes/ (match.ts, queries.ts, cook-again.tsx)

CONTEXT
We audited the app against a design checklist: "count screens, max 5 to 7, over 7 trim", and "retention hook: create an
unfinished state". Today there are about 14 user-facing routes. The bottom nav has 4 tabs (Pantry, Recipes, List,
Activity), plus a header link to /household.

PART 1: SURFACE AREA
Target: at most 7 distinct user-facing screens after sign-in (counting a screen as something with its own full-page
layout, NOT a sheet, dialog, or tab within a page). Proposed final map, confirm against the code and adjust only with
a reason:
  1. /pantry (Add food stays a sheet; fold /pantry/add bulk entry into the same sheet or a second step of it if
     feasible, otherwise keep it and say why)
  2. /recipes with one in-page tab/filter control for Ideas | Saved | Ours (they are already tabs; make sure they are
     truly one screen and not three heavy routes, e.g. shared layout, no full reload feel)
  3. /recipes/[id] (detail, includes cook mode)
  4. /recipes/new and /recipes/[id]/edit share ONE form screen/component; consider presenting it as a full-height
     sheet from /recipes so it is not a separate screen
  5. /list
  6. /activity with Activity | Stats as a segmented control on the same page (fold /activity/stats in)
  7. /household which also hosts the Pro/upgrade card; /pro becomes a sheet or section opened from there and from
     any "upgrade" prompts (AI limit notice, etc.)
Auth, welcome, onboarding, join/[code], legal, and admin routes are out of scope for the count (pre-login or
internal) and must not be changed except for fixing links.

Rules for the trim:
- NEVER break an existing URL. Old paths must redirect (permanentRedirect, or a client redirect where server
  redirect is not possible) to their new home, preserving query strings that matter. This includes /pantry/add,
  /recipes/saved, /recipes/ours, /activity/stats, /pro. Push notifications and bookmarks may point at these.
- Grep for every internal link/`href`/`router.push`/`redirect(` to the old paths and update them. Check
  src/app/manifest.ts shortcuts, README and docs, and native deep link handling in src/lib/native-app.ts.
- Preserve each route's loading.tsx / error.tsx behavior on the surviving routes. Delete the ones that disappear.
- Active-tab highlighting in bottom-nav must still work for all child paths and redirects.
- Do not remove any feature, only relocate it. If something cannot be relocated cleanly, list it in your report and
  leave it where it is.
- Keep Server Components server-side where they are. Do not turn data-heavy pages into client components just to
  get tabs; use URL-driven state (searchParams) or the existing SectionTabs pattern.

PART 2: "PICK UP WHERE YOU LEFT OFF" ON PANTRY
Add a compact strip at the top of /pantry (above the list, below the header) that shows up to 3 cards, only the ones
that apply, in this priority order:
  a. Expiring: "2 things expire in the next 2 days" -> scrolls to / filters the Expiring soon section. Reuse the
     existing section data, do not recompute differently.
  b. Almost there: "You're 1 ingredient away from <Recipe>" using the existing recipe match results
     (src/features/recipes). It must NOT call Spoonacular or the AI on every pantry load. Read from whatever the
     recipes page already caches (the shared hourly cache) and show nothing if there is no cached result. If this
     needs a new query, make it cache-only. Mind the Spoonacular free tier: 50 points a day.
  c. Streak: "3 day cooking streak. Cook something today to keep it." (use cookingStreak from
     src/features/activity/stats.ts; do not duplicate). If streak is 0, show "Cook today to start a streak" only if
     the household has cooked at least once before; never show it to a brand-new household.
Cards are dismissible for the day (store the dismissal in localStorage wrapped in try/catch; the page must render
correctly if storage is unavailable). Empty state: render nothing, no empty box. It must not shift layout after
load (reserve no space if there are no cards, and server-render the cards so there is no flash). Keep it visually
light, using existing shadcn components and tokens; match the current spacing and the enlarged touch targets.

TESTS AND CHECKS
- Unit tests for any new pure logic (card selection/priority, dismissal key, redirect map). Put pure logic in its own
  module so it is testable without React.
- A test (or a table-driven check) that every old path in the redirect map resolves to a surviving route.
- Run `npm run typecheck && npm run lint && npm run test && npm run build` and make sure all pass.
- Do a browser check with the preinstalled Playwright/Chromium at 375px and at desktop width: bottom nav, each
  merged screen, each old URL redirecting, the pickup strip with and without data. Take screenshots into your
  scratchpad (not the repo) and describe what you saw. If you cannot sign in to a real account, say what you could
  and could not verify.

WHEN DONE: commit on your branch, then reply with: the branch name, the final screen list with the count, the redirect
map, anything you chose not to move and why, and what you could not verify. Do not merge, push to main, or open a PR.
```

---

## Lead checklist after both workstreams report

1. `/code-review` each branch.
2. `git fetch origin`, merge `origin/main` into each branch, rerun all checks.
3. Merge B first if it is ready (no migration). A needs: apply the migration to Supabase, add Apple/Firebase env vars in Vercel, then `npx cap sync` and a new native build.
4. Open PRs as drafts. The user merges (pushes to `main` auto-deploy to Vercel).
5. Update `docs/app-store-launch.md` checkboxes and `PROGRESS.md`.
