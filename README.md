# LazyChef

A shared pantry, shopping list and recipe finder for one household. Mobile-first.
Built with Next.js 16, Supabase (auth, Postgres with row-level security, realtime) and Spoonacular.

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
   - `SUPABASE_SECRET_KEY`: Production and Preview, marked Sensitive.
   - `SPOONACULAR_API_KEY`: optional. Without it, adding food uses the built-in ingredient library only.
   - `NEXT_PUBLIC_SITE_URL`: optional, e.g. `https://lazychef-gamma.vercel.app`. Only used when a request
     doesn't say which host it came from.
3. `npx vercel@latest deploy --prod`
4. Supabase → Authentication → URL Configuration: set Site URL to the production URL, add
   `https://<domain>/**` to Redirect URLs, and keep `http://localhost:3000/**` for local development.
   (Preview deployments need their own URL here too, or their email links fall back to the Site URL.)
5. Google sign-in: the authorized redirect URI stays `https://<project-ref>.supabase.co/auth/v1/callback`.
   Add the production URL to Authorized JavaScript origins.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run test:db` | Runs the migrations in PGlite and tests the access rules (no Docker needed) |
| `npm run db:types` | Regenerates `src/types/database.ts` from the live schema (needs `npx supabase login` once) |

## How it fits together

- `src/app/`: routes only. `(auth)` holds the sign-in pages; `(app)` holds the tab-bar pages for signed-in
  members of a household.
- `src/features/<domain>/`: server actions, queries and components per feature.
- `src/lib/supabase/`: clients for the browser, server, and the session-refreshing proxy.
- `supabase/migrations/`: the schema. Every table a household shares is guarded by `private.is_member()`.
  Creating, joining and leaving households only happen through Postgres functions.
- Realtime: triggers broadcast row changes to a private `household:<id>` channel, which only members can
  subscribe to.
