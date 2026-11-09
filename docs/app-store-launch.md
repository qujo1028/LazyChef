# LazyChef on the App Store: launch checklist

LazyChef today is a Next.js web app on Vercel (server-rendered pages, server actions, Supabase). The App Store
only takes native iOS apps, so launching means wrapping it in a native shell **and** fixing the things Apple
rejects web-based apps for. This list is ordered by what blocks you first.

Legend: 🔴 Apple will reject without it · 🟠 needed to work properly in the app · 🟢 strongly recommended

---

## 0. Decide how to ship (do this first)

**Recommended: Capacitor shell that loads the live site, plus native features.**

**Started 2026-11-09:** the shell, offline screen and in-app Google sign-in are set up; see
[mobile-apps.md](mobile-apps.md).

- The app can't be a static export: it depends on server actions, server-rendered pages and server-only keys
  (Spoonacular, Supabase secret key). So the native app should load `https://<your domain>` (Capacitor
  `server.url`) and keep Vercel as the backend.
- 🔴 **Guideline 4.2 (Minimum Functionality)** rejects apps that are "just a website in a wrapper". You need
  real native value on top. Good fits for LazyChef:
  - Native barcode scanner (AVFoundation / VisionKit) instead of the web ZXing one.
  - Push notifications ("milk expires tomorrow", "Sam added 4 things to the list").
  - Haptics on check-off, native share sheet for invite links, native camera / photo picker for recipe photos.
  - An offline screen (and ideally a cached read-only pantry and list for the store, where signal is bad).
- Alternative: rewrite the front end in React Native / Expo against the same Supabase backend. Much more work,
  much lower 4.2 risk. Only worth it if the Capacitor build gets rejected.

What you need before any of this:
- [ ] 🔴 **Apple Developer Program** membership ($99/year). Enroll as an individual (your name shows as the
      seller) or an organization (needs a D-U-N-S number; takes days to weeks).
- [ ] 🔴 A Mac with the current **Xcode** (App Store builds must use the latest iOS SDK Apple requires).
- [ ] 🟢 An iPhone to test on (camera, push and Sign in with Apple don't fully work in the simulator).

---

## 1. Features Apple requires (missing today)

### 1.1 🔴 In-app account deletion (Guideline 5.1.1(v))
**Built (2026-11-08); migration applied to the live database.** Try it with a throwaway account once
it's deployed. Details in PROGRESS.md. Still open:
revoking the Apple token once Sign in with Apple exists.

Apple requires a way to delete your account inside the app.
- [x] "Delete account" on the Household page (You card), with a confirm dialog.
- [x] Database trigger (works for dashboard deletions too): a household whose last member is gone is
      deleted with its pantry, list, recipes, saved recipes, barcodes and activity; an ownerless household
      passes to its longest-standing member.
- [x] Server action that deletes the auth user with the secret key, removes the deleted households' recipe
      photos from Storage, clears the session and shows "Your account was deleted." on `/login`.
- [x] PGlite tests (`supabase/tests/account-deletion.test.mjs`). No type changes needed.
- [x] Activity entries in shared households stay, shown as "Someone".
- [x] Apply the migration to the live database.
- [ ] Test with a throwaway account once deployed.
- [ ] Revoke the Apple token on deletion, once Sign in with Apple exists (Apple requires it).

### 1.2 🔴 Sign in with Apple (Guideline 4.8)
You offer "Continue with Google", so you must also offer Sign in with Apple (or an equivalent privacy-focused
login).
- [ ] Turn on the Apple provider in Supabase → Authentication → Providers (needs a Services ID, a key and your
      Team ID from the Apple Developer portal).
- [ ] Native Sign in with Apple in the iOS app (a Capacitor plugin), passing the ID token to
      `supabase.auth.signInWithIdToken`. Add a web button too, so web and app match.
- [ ] Handle "Hide my email" relay addresses (they're real addresses; just don't treat them as odd).
- [ ] Button styled per Apple's guidelines, at least as prominent as the Google button.

### 1.3 🔴 Privacy policy and support pages
- [ ] A **privacy policy** at a public URL, linked inside the app (sign-up page and Household page) and in
      App Store Connect. It has to say what you collect and why, who you share it with, how long you keep it
      and how to delete it. For LazyChef that's:
  - Supabase (accounts, household data, recipe photos), Vercel (hosting, Web Analytics, Speed Insights),
    Google (sign-in), Apple (sign-in), Spoonacular (pantry ingredient names sent for recipe search and
    ingredient parsing), Open Food Facts (barcodes looked up), Groq (only if the AI features ship).
- [ ] A **support URL** (a simple page with a contact email works) and a support email.
- [ ] **Terms of use** (or use Apple's standard EULA; say so in App Store Connect).
- [ ] Add these as public routes the proxy doesn't send to `/login` (e.g. `/privacy`, `/terms`, `/support`).

### 1.4 🔴 Google sign-in inside the app
Google blocks OAuth inside embedded web views (`disallowed_useragent`), so the current
`signInWithGoogle` redirect (`src/features/auth/actions.ts`) will fail inside the app.
- [x] Open the OAuth flow in an in-app browser tab and come back via the `app.lazychef://` link
      (built 2026-11-09). Still to do: add `app.lazychef://auth/callback**` to Supabase Redirect URLs and test.
      Later, `ASWebAuthenticationSession` or native Google Sign-In removes iOS's "Open in LazyChef?" prompt.
- [ ] Publish the Google OAuth app (it's in "Testing", which only lets listed test users sign in). Google
      needs the privacy policy URL and a homepage on a domain you own for that.

### 1.5 🔴 Permission prompts (Info.plist)
- [x] `NSCameraUsageDescription`: "LazyChef uses the camera to scan barcodes on groceries."
- [x] `NSPhotoLibraryUsageDescription`: for recipe photos (`src/features/recipes/components/photo-field.tsx`).
- [ ] Push permission asked at a sensible moment (not on first launch), with a short explanation first.

### 1.6 🔴 Privacy manifest and App Privacy labels
- [ ] `PrivacyInfo.xcprivacy` in the iOS project, declaring any "required reason" APIs your code and plugins
      use (Capacitor and most plugins ship their own; check each one has one).
- [ ] App Privacy "nutrition label" in App Store Connect. Likely answers: contact info (email, name), user
      content (photos, recipes, pantry), identifiers (user ID), usage data (Vercel Analytics). All
      "linked to you", none "used for tracking". No tracking means no App Tracking Transparency prompt.
- [x] Export compliance: the app only uses standard HTTPS, so set `ITSAppUsesNonExemptEncryption` to `NO`.

---

## 2. Making the web app behave like a native app

- [ ] 🟠 **Your own domain** (e.g. `lazychef.app`). `lazychef-gamma.vercel.app` works but you need a domain
      you own for universal links, Google OAuth verification, custom email, and the privacy/support URLs.
      Update Supabase Site URL + Redirect URLs, Google origins, `NEXT_PUBLIC_SITE_URL`, and the CSP if needed.
- [ ] 🟠 **Universal links** (`/.well-known/apple-app-site-association` on that domain) so these open the
      app instead of Safari:
  - Invite links (`/join/[code]`): the core of the "share with housemates" flow.
  - Email confirmation and password reset links (`/auth/callback`).
- [ ] 🟠 **Real email sending.** Supabase's built-in mailer only reaches your own Supabase team, 2 emails an
      hour (see README → Email). Set up custom SMTP (Resend, Postmark, SES…) on your domain, or password
      resets and email sign-up won't work for real users.
- [x] 🟠 **Offline / no-connection screen** (done 2026-11-09; offline caching of the list still open). With a remote URL, no signal means a blank white screen. Show a
      native "You're offline" view with a retry button. Grocery stores are bad-signal zones, so consider
      caching the shopping list for read and check-off offline.
- [ ] 🟠 **External links** open in an in-app browser (SFSafariViewController), not inside your web view:
      recipe source links (`src/app/(app)/recipes/[id]/page.tsx`), Spoonacular / TheMealDB / Open Food Facts
      credits.
- [ ] 🟠 **Native barcode scanner** to replace the in-page camera (`barcode-scanner.tsx`). Faster, works
      without `wasm-unsafe-eval`, and counts toward 4.2. Keep the web scanner for the website.
- [ ] 🟠 **Session persistence**: check that the Supabase cookie session survives killing the app, a phone
      restart, and a week of not opening it.
- [ ] 🟢 Feel: launch screen + splash, status bar colors in light and dark, no rubber-band bounce on fixed
      screens, no long-press text selection on buttons, swipe-back where it makes sense, pull-to-refresh on
      Pantry and List, keyboard not covering inputs in the sheets.
- [ ] 🟢 Push notifications (APNs key in the Apple portal, a `device_tokens` table with RLS, a sender on the
      server or a Supabase Edge Function): expiring soon, list changes by housemates, "someone joined your
      household". Each one with an on/off switch.
- [ ] 🟢 App update path: since the UI is served from Vercel, web fixes go live without App Review. Native
      changes (plugins, permissions) still need a new build.

---

## 3. Backend and services to get production-ready

- [ ] 🟠 **Supabase plan.** Free projects pause after a week with no activity and have no daily backups.
      Move to Pro (or at least set up backups) before real users depend on it.
- [ ] 🟠 **Vercel plan.** Hobby is for non-commercial use. If you charge money or run ads, move to Pro.
- [ ] 🟠 **Recipe data licenses.**
  - TheMealDB: the library was imported with the test key `1`, which is for development only. A public app
    needs their supporter key; re-run `npm run recipes:import -- --write` with it.
  - Spoonacular: the free plan is 50 points a day for **everyone combined**. With more than a few active
    households, recipe search will "rest until tomorrow" by mid-morning. Budget for a paid plan, or lean on
    the local library and only use Spoonacular for "Show more ideas". Keep the attribution on every page.
  - Open Food Facts: data is ODbL; keep the credit in the scanner, and send a descriptive User-Agent.
- [ ] 🟠 **Abuse protection on sign-up**: turn on Supabase Auth CAPTCHA (hCaptcha / Turnstile) or rely on
      Apple/Google sign-in only, so bots can't mass-create accounts.
- [ ] 🟢 **Error and crash reporting** (e.g. Sentry for both the web app and the native shell). Right now
      you'd only see errors in Vercel logs.
- [ ] 🟢 Supabase security + performance advisors run again after the account-deletion migration.
- [ ] 🟢 Groq / AI features: only an API client exists today. If you ship an AI feature, Apple
      (Guideline 5.1.2) wants it disclosed that data goes to a third-party AI, with consent before sending.

---

## 4. App Store Connect listing

- [ ] 🔴 App record: name (check "LazyChef" is free), bundle ID (e.g. `app.lazychef.ios`), SKU, primary
      language.
- [ ] 🔴 **Icon**: 1024×1024 PNG, no transparency, no rounded corners (Apple rounds it). The current icon
      is drawn in code (`src/lib/app-icon.tsx`); export a proper one. Add dark and tinted variants for iOS 18+.
- [ ] 🔴 **Screenshots**: iPhone 6.9" set required (3 to 10). Show Pantry, Recipes "Make now", Shopping list
      at the store, barcode scanning, and the shared household. iPad screenshots only if you support iPad
      (recommend iPhone-only at first).
- [ ] 🔴 Subtitle (30 chars), description, keywords (100 chars), promotional text, category
      (**Food & Drink**), copyright line.
- [ ] 🔴 **Age rating** questionnaire (likely 4+; there's no open chat or public content).
- [ ] 🔴 Privacy policy URL, support URL, App Privacy answers (section 1.6).
- [ ] 🔴 Price (Free) and countries. For the EU, declare whether you're a "trader" under the Digital
      Services Act (traders must show an address and phone number publicly).
- [ ] 🔴 **App Review notes + demo account**: a test login (email + password) that's already in a household
      with a stocked pantry, a few list items and saved recipes. Explain household invites, and that the
      second person can be simulated with an invite code you provide. Without this, reviewers reject apps
      they can't get past the login screen of.
- [ ] 🟢 If you ever charge for features (premium recipes, more households), that must use Apple In-App
      Purchase, plus the Paid Apps agreement, tax and banking forms. Not needed for a free launch.

---

## 5. Test before you submit

- [ ] 🔴 TestFlight build to yourself and a few housemates for at least a week.
- [ ] Sign up with email, Google and Apple; password reset from the email link; invite link opening the app.
- [ ] Barcode scan on a real iPhone (PROGRESS.md notes the camera was never tested on a real device).
- [ ] Live sync on two phones at once (also never checked on real devices, per PROGRESS.md).
- [ ] Airplane mode, slow network, app killed and reopened, a week-old session.
- [ ] Delete account end to end, including as the owner of a shared household.
- [ ] Smallest supported iPhone (SE) and largest, light and dark mode, Dynamic Type at larger sizes,
      VoiceOver on the main flows.
- [ ] Open the "Not done" items in PROGRESS.md: the 320/375 px check of the local-recipe screens.

---

## 6. After launch

- [ ] Watch crash reports, Vercel logs, Supabase usage and the Spoonacular daily points the first week.
- [ ] Reply to App Store reviews; ask for a rating after a happy moment (e.g. after cooking a recipe) with
      `SKStoreReviewController`, not on launch.
- [ ] Keep the native shell updated each year for the new iOS SDK requirement.

---

## Suggested order

1. Apple Developer enrollment + domain (both have wait times; start now).
2. Account deletion, privacy/terms/support pages, custom SMTP: all doable in the current web app.
3. Capacitor shell: Sign in with Apple, native Google sign-in, universal links, offline screen,
   external links, permission strings, privacy manifest.
4. Native extras for 4.2: barcode scanner, push notifications, haptics, share sheet.
5. Supabase / Vercel / TheMealDB / Spoonacular plans.
6. TestFlight with housemates, then the App Store listing, demo account and submission.
