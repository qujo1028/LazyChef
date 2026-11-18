# LazyChef

A shared pantry, shopping list and recipe finder for one household. Mobile-first.
Built with Next.js 16, Supabase (auth, Postgres with row-level security, realtime) and Spoonacular,
with iOS and Android apps (Capacitor) and Pro subscriptions through RevenueCat.

## What it does

- **Pantry**: type or paste what you have ("2 lbs chicken breast, milk"). Items get categories from a
  built-in ingredient library, expiry dates, "−1" / "Used some", staples that are always on hand, and a
  "Ran out" section.
- **Recipes**: "Make now" (you have everything) and "Almost there" (1 to 3 things missing), filtered by
  meal and cook time. Spoonacular results are cached for an hour in one server-only cache shared by every
  household, and a daily points record keeps the free plan (50 points a day, reset at midnight UTC) from
  running out: when it's used up, the page says searches are resting until tomorrow.
- **I cooked this**: on a recipe, review what comes out of the pantry (converted to each item's unit, or
  "check this" when units don't convert), then take it all out at once, with Undo. Anything that ran out
  can go straight onto the list.
- **Barcode scanning**: scan a whole grocery haul into the pantry (names come from Open Food Facts, cleaned up
  to "24 eggs"), or scan things into the cart at the store to check them off the list. Each household
  remembers what it calls a barcode, so the second scan is instant.
- **Shopping list**: grouped by aisle, check off with one tap at the store, then "Put away" moves it all
  into the pantry, topping up what's already there.
- **Saved recipes**: a heart on any recipe saves it for the whole household. The Saved tab shows which ones you
  can make right now, what each still needs, and how often you've cooked it.
- **Activity**: who added, used, cooked and bought what. Everything above updates live for housemates.
- **Stats** (Activity, "Log | Stats"): meals cooked per week, your cooking streak, most cooked recipes, shopping trips and what you buy
  most, and what each housemate has been up to.

### Screens

Five tab screens plus recipe detail. Everything else is a sheet or a tab inside one of them.

| Screen | Address | Lives inside it |
| --- | --- | --- |
| Pantry | `/pantry` | Add food and the "Just went shopping" bulk add (with barcode scanning) as sheets |
| Recipes | `/recipes` | Ideas, Saved (`?view=saved`) and Ours (`?view=ours`) as tabs; add or edit your own recipe as a sheet |
| List | `/list` | |
| Activity | `/activity` | Log, Chart and Board (`?view=log`, `chart` or `board`; `stats` still works as `chart`) |
| Household | `/household` | Members, invites, your food preferences, and the LazyChef Pro card and paywall |
| Recipe detail | `/recipes/[id]` | Cook sheet, ratings, the edit sheet for your own recipes |

First-run and account pages (`/welcome`, `/onboarding`, `/login`, `/join/[code]`, legal) are separate.

Old addresses still work. `next.config.ts` permanently redirects them (query strings kept), from the
map in `src/lib/legacy-routes.ts`: `/pantry/add` to `/pantry?add=bulk`, `/recipes/saved` and `/recipes/ours`
to `/recipes?view=saved|ours`, `/recipes/new` to `/recipes?view=ours&new=1`, `/recipes/[id]/edit` to
`/recipes/[id]?edit=1`, `/activity/stats` to `/activity?view=chart`, and `/pro` to `/household?pro=1`.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Supabase → Project Settings → API Keys).
3. Apply the SQL files in `supabase/migrations/` to your Supabase project, in filename order. Use the
   Supabase MCP server, or paste each file into Dashboard → SQL Editor and run it.
4. Configure Supabase Auth (below).
5. `npm run dev` and open http://localhost:3000.

### Supabase Auth settings

**URL configuration** (Authentication → URL Configuration)
- Site URL: `http://localhost:3000` (your production URL once deployed)
- Redirect URLs: `http://localhost:3000/**` (add `https://<your-domain>/**` when deployed)

**Email.** Supabase's built-in mailer only delivers to members of your Supabase team, at 2 emails an hour.
For housemates signing up with email, either:
- turn off **Confirm email** (Authentication → Sign In / Providers → Email). Sign-up then works
  immediately. Password-reset emails still only reach your team; or
- add custom SMTP (Authentication → Emails → SMTP Settings). Most providers need a domain you own.

**Email templates** (optional; makes email links work even if opened in a different browser).
Authentication → Emails → Templates:
- Confirm signup: link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
- Reset password: link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`

**Google sign-in**
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then set up
   Google Auth Platform → Branding (app name, support email) and Audience (External).
2. Clients → Create client → Web application:
   - Authorized JavaScript origins: `http://localhost:3000` (plus your production URL later)
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste the client ID and secret into Supabase → Authentication → Sign In / Providers → Google.
4. While the Google app is in "Testing", only the test users you list can sign in. Add your
   housemates there, or publish the app. Basic email/profile access doesn't need Google's review.

## Deploying to Vercel

1. `npx vercel@latest login`, then link this folder to the `lazychef` project (`npx vercel@latest link`).
   `vercel.json` tells Vercel it's a Next.js app.
2. Project → Settings → Environment Variables (names only; values come from Supabase):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: all environments.
   - `SUPABASE_SECRET_KEY`: Production and Preview, marked Sensitive. The server uses it to read and write
     the Spoonacular cache and usage tables, which signed-in users can't touch. Without it, each server
     instance keeps its own in-memory cache instead.
   - `SPOONACULAR_API_KEY`: Production and Preview, marked Sensitive. Get it from
     [spoonacular.com/food-api/console](https://spoonacular.com/food-api/console) → Profile → API Key, then
     Vercel → Project → Settings → Environment Variables → Add, and redeploy. Without it, the Recipes tab
     says recipes aren't set up yet, and adding food uses the built-in ingredient library only. Never put it
     in a `NEXT_PUBLIC_` variable.
   - `NEXT_PUBLIC_SITE_URL`: optional, e.g. `https://lazychef-gamma.vercel.app`. Only used when a request
     doesn't say which host it came from.
   - Admin dashboard (optional): `ADMIN_EMAILS`, `GITHUB_DASHBOARD_TOKEN`, `GITHUB_REPO`, `CRON_SECRET`.
     Set them for Production, and mark the token and secret Sensitive. See [Admin dashboard](#admin-dashboard-admin).
3. `npx vercel@latest deploy --prod`
4. Supabase → Authentication → URL Configuration: set Site URL to the production URL, add
   `https://<domain>/**` to Redirect URLs, and keep `http://localhost:3000/**` for local development.
   (Preview deployments need their own URL here too, or their email links fall back to the Site URL.)
5. Google sign-in: the authorized redirect URI stays `https://<project-ref>.supabase.co/auth/v1/callback`.
   Add the production URL to Authorized JavaScript origins.

## If a key leaks or something looks wrong

This repo is public, so never commit `.env.local` or paste keys into issues or PRs. If a secret does
get out, or you see activity you don't recognize:

1. **Supabase secret key**: Supabase → Project Settings → API Keys → create a new secret key, put it
   in Vercel (`SUPABASE_SECRET_KEY`, Production and Preview) and `.env.local`, redeploy, then delete
   the old key. It bypasses every access rule, so do this first.
2. **Spoonacular key**: spoonacular.com/food-api/console → Profile → regenerate, then update
   `SPOONACULAR_API_KEY` in Vercel and `.env.local` and redeploy.
3. **RevenueCat keys**: RevenueCat → Project settings → API keys → create a new secret key and
   revoke the old one; for the webhook, set a new Authorization value in RevenueCat and in
   `REVENUECAT_WEBHOOK_AUTH` at the same time. Update Vercel and `.env.local`, redeploy.
4. **Sign everyone out**: Supabase → Authentication → Users → sign out each user (or rotate the JWT
   secret under Project Settings → JWT Keys, which signs out everyone at once).
5. **Invite codes**: on the Household page, tap "Reset code" for each household, so old links stop
   working.
6. **Look around**: Vercel → Logs and Supabase → Logs for the time window, the Supabase security
   advisor, and GitHub → Security for Dependabot and CodeQL alerts.

The publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) is public by design; the database's
access rules are what protect the data.

## iOS and Android apps (Capacitor)

The apps in `ios/` and `android/` are native shells around the live site (`capacitor.config.ts`).
Every page is built on the server, so the web app can't be bundled into the app; instead the app
opens https://lazychef-gamma.vercel.app and native plugins (RevenueCat for purchases) talk to the
page through Capacitor's bridge. A web deploy updates the apps too. Without a connection the app
shows `mobile/www/offline.html`.

You need Xcode (Mac App Store) for iOS and Android Studio for Android.

```bash
npm run ios        # sync, then open the Xcode project (press Run for the simulator)
npm run android    # sync, then open Android Studio
```

- **Against your local dev server:** `CAP_SERVER_URL=http://localhost:3000 npx cap sync`, then run
  from Xcode / Android Studio. Run plain `npx cap sync` again before a release build so the app
  points back at production. (An Android emulator reaches your Mac at `http://10.0.2.2:3000`.)
- **App id:** `com.qujo1028.lazychef` (Xcode bundle id and Android application id). Change it in
  `capacitor.config.ts`, Xcode and `android/app/build.gradle` together, before the first upload.
- **Camera text:** the barcode scanner's permission text is in `ios/App/App/Info.plist`
  (`NSCameraUsageDescription`); Android asks with the `CAMERA` permission in its manifest.
- After adding a Capacitor plugin: `npm install` it, then `npx cap sync`.

## Pro subscriptions (RevenueCat)

Pro is one entitlement, `lazychef_pro`, sold as two plans: **Yearly $24.99 with a 3-day free trial**
(shown first, as the best deal) and **Monthly $4.99**. One subscription covers the whole
household: everyone in a household has Pro when any member does. Purchases happen in the apps
(App Store / Google Play); the website shows the same paywall and says to get Pro in the app.

How it fits together:
- The app signs in to RevenueCat with the Supabase user id (`src/features/pro/purchases.ts`).
- RevenueCat calls `POST /api/revenuecat/webhook` on every change. The route checks the
  Authorization header, logs the event once in `revenuecat_events`, then fetches each affected
  customer from RevenueCat's API and saves their current state in `subscriptions` (so retries and
  out-of-order events can't leave it wrong).
- Right after a purchase or restore, the app also asks the server to fetch it (`refreshPro()`),
  so Pro switches on without waiting for the webhook.
- The database decides who has Pro: `private.household_is_pro()` (subscriptions plus hand-given
  comps in `private.pro_comps`), and `get_pro_status()` for the Pro card and paywall.

### Setup

1. **App Store Connect** (Apple Developer account, $99/year): sign the Paid Apps agreement (Business),
   create the app with bundle id `com.qujo1028.lazychef`, then Subscriptions → one subscription group
   "LazyChef Pro" with two auto-renewable subscriptions:
   - `lazychef_pro_yearly`: 1 year, $24.99, plus an Introductory Offer: Free, 3 days.
   - `lazychef_pro_monthly`: 1 month, $4.99.
2. **Google Play Console** ($25 once): create the app (`com.qujo1028.lazychef`), then Monetize →
   Subscriptions → the same two product ids, each with a base plan; add a 3-day free trial offer to
   the yearly base plan. (Play needs one uploaded build before it lets you add products.)
3. **RevenueCat** (free until $2,500/month in revenue): create a project, add the App Store app
   (with an App Store Connect in-app purchase key) and the Play Store app (with a service account),
   then:
   - Entitlements → `pro`, attach both products.
   - Offerings → `default` (current) with the packages **Annual** → yearly and **Monthly** → monthly.
   - API keys → copy the public `appl_` and `goog_` keys and a **secret** key.
   - Integrations → Webhooks → URL `https://<your-domain>/api/revenuecat/webhook`, Authorization header
     value = a long random string (the same value goes in `REVENUECAT_WEBHOOK_AUTH`).
4. **Environment variables** (Vercel → Settings → Environment Variables, and `.env.local`):
   `REVENUECAT_SECRET_API_KEY` and `REVENUECAT_WEBHOOK_AUTH` (Production + Preview, Sensitive), and
   `NEXT_PUBLIC_REVENUECAT_IOS_KEY`, `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` (all environments). Redeploy.
   `SUPABASE_SECRET_KEY` must be set too.
5. Apply `supabase/migrations/20261108000100_subscriptions.sql`.

### Giving someone Pro for free

In the Supabase SQL Editor (the person's id is in Authentication → Users):

```sql
insert into private.pro_comps (user_id, note) values ('<user id>', 'founder');
-- with an end date: ... (user_id, note, expires_at) values ('<user id>', 'beta tester', '2027-06-01');
```

Their whole household gets Pro. Delete the row to take it back.

### Testing purchases

- **Webhook:** RevenueCat → Integrations → Webhooks → "Send test event". It should show 200, and a
  `TEST` row appears in `revenuecat_events`.
- **Sandbox purchase (iOS):** add a Sandbox tester in App Store Connect → Users and Access, sign in
  to it on the device under Settings → App Store → Sandbox Account, run the app from Xcode, open
  Household → "See what Pro includes", and start the trial. Sandbox time runs fast (a 3-day trial
  ends in minutes, a year renews every hour), so you'll see renewals and the expiry arrive by webhook.
- **Check the result:** `select * from subscriptions;` shows the trial, the Household page says
  "Free trial until …", and housemates see "<name>'s Pro covers everyone in this household."

## Recipe library (TheMealDB)

"Make now" and "Almost there" match the pantry against our own recipes first (the shared
library plus each household's own), in the database, for free. Spoonacular is only asked
when fewer than 10 local ideas come back, or when someone taps "Show more ideas".

The shared library is imported from [TheMealDB](https://www.themealdb.com) by a script, not the app:

```bash
THEMEALDB_API_KEY=1 npm run recipes:import -- --dry-run   # writes data/themealdb/preview.json, touches nothing
npm run recipes:import -- --write                         # upserts into Supabase (safe to re-run)
```

- `THEMEALDB_API_KEY`: TheMealDB's key. `1` is their test key, for development only; a public
  app needs a paid supporter key. Server-only, never `NEXT_PUBLIC_`.
- `--write` also needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the shared library
  can only be written with the secret key).
- Images and source links stay TheMealDB's (linked, not copied). Every imported recipe says
  "From TheMealDB" and links back to its page there, as their terms ask.

## Admin dashboard (`/admin`)

A developer dashboard for the people listed in `ADMIN_EMAILS`. Anyone else (signed in or not) gets a 404,
and search engines are told not to index it. Five tabs:

- **Overview**:
  - Users, active users, households, revenue and Pro (MRR, gross, net, refunds, conversion), and usage totals.
  - Activity and trend charts, the activation funnel, retention cohorts and popular recipes.
  - A red banner when an `alert` issue is open.
- **Board**: open issues in columns (Backlog, Up next, In progress) with move, close and reopen, plus open PRs
  and issues closed in the last week. PRs are links only; merge them on GitHub.
- **Health**:
  - The production deploy and recent deploys (from the GitHub Deployments Vercel posts), and CI on `main`.
  - Service status for Supabase, Groq, Spoonacular and RevenueCat. Spoonacular status comes from our usage
    table, so it costs no points.
  - Recent RevenueCat webhooks, and which env vars are set (names only).
- **Limits**: Spoonacular points (today and 30 days), the AI weekly allowance, hourly rate limits, requests turned
  away, AI and Spoonacular errors, and the recipe cache hit rate.
- **Support**:
  - Look up one account by its exact email, and give or remove free Pro (a comp).
  - The audit log. Every lookup, comp change and board action is recorded first; if that fails, nothing happens.

### Setup

1. **Admins**: set `ADMIN_EMAILS` (comma-separated, server-only) in Vercel and `.env.local`.
2. **GitHub**: create a fine-grained token for this one repo.
   - Permissions: **Issues: read and write**; **Pull requests, Deployments, Commit statuses, Metadata: read**.
     Add **Checks: read** too if it's offered; without it, the CI card shows commit statuses only.
   - Set it as `GITHUB_DASHBOARD_TOKEN`, and `GITHUB_REPO` to `owner/name`.
   - The board creates its `status: next` / `status: in-progress` labels the first time you move an issue,
     and the alerts create the `alert` label.
3. **Daily job**: set `CRON_SECRET` to a long random string (`openssl rand -hex 32`).
   - `vercel.json` runs `/api/admin/snapshot` every day at 00:10 UTC. Vercel sends the secret.
   - It saves the day's totals (for the trend charts) and opens a GitHub issue labelled `alert`, or comments on
     the open one, when something needs a look. For example: Spoonacular ran out, the production deploy failed,
     no RevenueCat webhooks for 14 days, AI refusals or errors spiked, or Supabase or Groq is down.
4. **Database**: apply `supabase/migrations/20261118060000_admin_dashboard.sql`.
   - Its functions run only with the secret key (`service_role`).
   - It adds daily counters, daily snapshots, the audit log, and counting inside `take_rate_limit` and
     `take_ai_allowance`.

Without a token or key, each card says what's missing and the rest of the page still works.

Data notes:
- Revenue comes from the RevenueCat webhooks we've stored (production only, since they were set up).
  RevenueCat's dashboard is the source of truth.
- MRR, net and active users are estimates.
- Counters and snapshots start the day the migration is applied. Earlier user and household totals are
  rebuilt from signup dates, so deleted accounts are missing from them.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 (first copies the barcode reader's `.wasm` into `public/vendor/`) |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) for the pure logic: parsing, units, matching, list and pantry state |
| `npm run test:db` | Runs the migrations in PGlite and tests the access rules (no Docker needed) |
| `npm run ingredients` | Rebuilds the ingredient library (`-- --check` to verify it's up to date) |
| `npm run ios` / `npm run android` | Syncs the Capacitor app and opens it in Xcode / Android Studio |
| `npm run cap:sync` | Copies `capacitor.config.ts` and plugins into both native projects |
| `npm run db:types` | Regenerates `src/types/database.ts` from the live schema (needs `npx supabase login` once) |

## How it fits together

- `src/app/`: routes only. `(auth)` holds the sign-in pages; `(app)` holds the tab-bar pages for signed-in
  members of a household (see Screens above).
- `src/features/<domain>/`: server actions, queries and components per feature.
- `src/lib/supabase/`: clients for the browser, server, and the session-refreshing proxy.
- `supabase/migrations/`: the schema. Every table a household shares is guarded by `private.is_member()`.
  Creating, joining and leaving households only happen through Postgres functions.
- Realtime: triggers broadcast row changes to a private `household:<id>` channel, which only members can
  subscribe to. The pantry and list keep their client state with `src/lib/row-state.ts` (newest row wins,
  deleted ids stay deleted).
- Server actions re-check the session and validate input with zod; client calls go through
  `src/lib/call-action.ts`, so a dropped connection shows a toast instead of the error screen.
- Spoonacular (`src/lib/spoonacular/`, server only): costs are in `cost.ts`. `src/features/recipes/cache.ts`
  keeps responses for at most an hour in `spoonacular_cache` (keyed by the sorted pantry names plus
  filters, or the recipe id) and the day's points in `spoonacular_usage`, both through the secret key.
  Only recipe id, title and image are kept longer (on shopping list lines). Every page shows a
  "Powered by Spoonacular" credit, and recipes link to their source.
- Security: `next.config.ts` sends a Content-Security-Policy (scripts only from this site; data only to
  this site and Supabase; images from here, Spoonacular and Google photos), HSTS, and frame/permission
  headers. If you add an image host or API the browser talks to, add it there. Rate limits live in
  Postgres (`private.rate_limit_rule()`): Spoonacular-spending calls go through `src/lib/rate-limit.ts`,
  and wrong invite codes are capped inside `get_invite_preview()` / `join_household()`. Avatar URLs
  must be https (anything else is cleared).
- Multi-row changes are single Postgres functions (`add_pantry_items`, `complete_shopping_trip`,
  `cook_recipe`), so each shows up as one entry in the activity feed. Cooking and shopping trips are logged
  as their own actions (`cooked`, `shopped`), which is what the Stats page and cook history read.
