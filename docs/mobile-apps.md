# iOS and Android apps

The apps are a [Capacitor](https://capacitorjs.com) shell around the live site. Pages, server actions and
server-only keys stay on Vercel, so a web deploy updates both apps right away. Only native changes (plugins,
permissions, icons) need a new App Store / Play build. The launch to-do list is in
[app-store-launch.md](app-store-launch.md).

| What | Where |
| --- | --- |
| App config (site URL, offline page) | `capacitor.config.ts` |
| Offline screen and fallback page | `native/www/` |
| iOS project (Xcode) | `ios/App/App.xcodeproj` |
| Android project (Android Studio) | `android/` |
| Google sign-in inside the app | `src/lib/native-callback.ts`, `src/components/native-app-bridge.tsx`, `src/features/auth/components/google-button.tsx` |
| Native iOS sign-in plugin (auth sheet, Sign in with Apple) | `ios/App/App/LazyChefAuthPlugin.swift` (registered in `SceneDelegate.swift`), `src/lib/native-auth.ts` |

Both apps use the bundle ID / package name **`app.lazychef`** and the link scheme **`app.lazychef://`**.

## One-time setup on this Mac

1. **Xcode** from the Mac App Store, then point the command line tools at it:
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then open Xcode once to install the iOS
   simulator.
2. **Android Studio** from developer.android.com. Its setup wizard installs the Android SDK and an emulator.
   It ships its own Java, so nothing else is needed.
3. **Supabase → Authentication → URL Configuration → Redirect URLs**: add `app.lazychef://auth/callback**`.
   Without it, Google sign-in in the app fails.

## Running the apps

```bash
npm run ios       # syncs, then opens Xcode: pick an iPhone simulator and press Run
npm run android   # syncs, then opens Android Studio: pick an emulator and press Run
```

Run `npm run cap:sync` after changing `capacitor.config.ts`, `native/www/` or adding a Capacitor plugin.

**Testing against `next dev`** instead of the live site: start `npm run dev -- -H 0.0.0.0`, then
`CAP_SERVER_URL=http://<this Mac's LAN IP>:3000 npm run ios`. Add `http://<that IP>:3000/**` to the Supabase
Redirect URLs too. Run a plain `npm run cap:sync` afterwards so the next build points at the live site again.

## How the pieces work

- **Offline**: if the site can't load, the app shows `native/www/offline.html` ("You're offline", Try again).
  It retries by itself when the connection comes back. Its URL must match `server.url` in `capacitor.config.ts`.
- **Google sign-in**: Google blocks its sign-in page inside app web views. In the app, the Google button asks
  the server for Google's URL and opens it with `openNativeOAuth` (`src/lib/native-oauth.ts`). Supabase sends
  the user back to `app.lazychef://auth/callback?code=…`, and the app loads `/auth/callback` in its own web
  view, which holds the sign-in cookies. iOS builds with the LazyChef auth plugin use
  `ASWebAuthenticationSession`, which hands the callback straight back with no "Open in LazyChef?" prompt.
  Android and older iOS builds open an in-app browser tab instead; the link closes it via
  `native-app-bridge.tsx` (older iOS builds still show the prompt).
- **Camera**: the web barcode scanner works in the app. iOS shows the `NSCameraUsageDescription` text and
  Android asks for the camera permission the first time.
- **iPhone only, portrait only** for now (as the launch checklist recommends). iPad can come later.
- Links to other websites (recipe sources, credits) open in an in-app browser sheet (Safari View Controller on iOS, Custom Tabs on Android), so you stay in LazyChef. Email links still open the mail app.

## Turning on Sign in with Apple

App Store guideline 4.8 requires Sign in with Apple next to Google sign-in. It's built but switched off: the
button is hidden and the server actions refuse until `NEXT_PUBLIC_APPLE_SIGN_IN=1`. Code:
`src/features/auth/apple.ts`, `src/features/auth/components/apple-button.tsx`, `signInWithApple` and
`signInWithAppleIdToken` in `src/features/auth/actions.ts`. To turn it on:

1. Join the **Apple Developer Program** and note your **Team ID** (Membership details).
2. **Certificates, Identifiers & Profiles → Identifiers**: on the App ID `app.lazychef`, tick the
   **Sign in with Apple** capability.
3. Create a **Services ID** (e.g. `app.lazychef.web`) for the website. Enable Sign in with Apple on it, set the
   primary App ID to `app.lazychef`, add the domain of your Supabase project (`<project-ref>.supabase.co`) and
   the return URL `https://<project-ref>.supabase.co/auth/v1/callback`.
4. **Keys**: create a key with Sign in with Apple enabled, download the `.p8` file (only downloadable once) and
   note its **Key ID**.
5. **Supabase → Authentication → Providers → Apple**: enable it. Under Client IDs enter both the bundle ID
   `app.lazychef` (native sign-in in the iOS app) and the Services ID (web sign-in), comma-separated. Generate
   the secret key from the `.p8`, Key ID, Team ID and Services ID (Supabase links a generator; Apple caps it at
   6 months, so set a reminder to regenerate it).
6. **Vercel → Settings → Environment Variables**: add `NEXT_PUBLIC_APPLE_SIGN_IN` = `1` (Production and
   Preview) and redeploy. It's read at build time, so it only takes effect after a new deploy.
7. Native iOS sign-in also needs the Sign in with Apple entitlement in Xcode: follow the Xcode steps below.
   App builds without it still work: the button falls back to Apple's web page, like Google.

Apple shares the user's name only on their first sign-in; it's saved as their display name then.

### Xcode steps for Sign in with Apple

Needs a paid Apple Developer Program team: a free Personal Team can't sign an app with this entitlement, so
don't add it before you've joined (the build would fail to sign).

1. Open `ios/App/App.xcodeproj` (`npx cap open ios`), select the **App** target → **Signing & Capabilities**.
2. Under **Signing**, pick your paid team for **Team**.
3. Click **+ Capability** → **Sign in with Apple**. Xcode creates `App/App.entitlements` and sets
   `CODE_SIGN_ENTITLEMENTS`; commit both changes.
4. Build to a device and test. The native sheet comes from the `LazyChefAuth` plugin
   (`ios/App/App/LazyChefAuthPlugin.swift`); without the entitlement Apple rejects the request with an
   error.

## Push setup

The app can send three pushes: food expiring soon, a housemate adding to the list, and someone joining the
household. Each has a switch in Household. The code is done; real delivery needs the steps below. Until they
are done the server skips pushes quietly (it never crashes).

**One-time, in order**

1. **Supabase**: apply `supabase/migrations/20261118120000_push_notifications.sql`.
2. **Apple (iPhone)**
   - Developer portal, Keys, new key with "Apple Push Notifications service (APNs)". Download the `.p8` once
     (Apple only shows it once). Note the Key ID and your Team ID.
   - In Vercel set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the `.p8` contents; `\n` for line breaks is
     fine), `APNS_BUNDLE_ID=app.lazychef` and `APNS_ENVIRONMENT=production`. Use `sandbox` only for builds run
     straight from Xcode.
   - Xcode: target App, Signing & Capabilities, add **Push Notifications** (and Background Modes, Remote
     notifications is optional). This updates `App.entitlements`.
   - In `ios/App/App/AppDelegate.swift` add the two forwarding methods the plugin needs
     (`didRegisterForRemoteNotificationsWithDeviceToken` and `didFailToRegisterForRemoteNotificationsWithError`,
     see the plugin's README).
3. **Android**
   - Firebase console: create a project, add an Android app with package `app.lazychef`, download
     `google-services.json` into `android/app/` (it is not secret, but keep it out of the repo if you prefer).
   - Project settings, Service accounts, Generate new private key. Put the whole JSON on one line in the Vercel
     env var `FCM_SERVICE_ACCOUNT_JSON`. Never commit it.
4. **Vercel**: `CRON_SECRET` is already used by the admin cron and also protects `/api/push/expiring`.
5. `npm run cap:sync`, then make a new iOS and Android build. Native changes need a new App Store build; the
   web side (settings card, server code) goes live on its own.

**How the expiring push is scheduled**

`vercel.json` runs `/api/push/expiring` once a day at 17:00 UTC (the Hobby plan allows one run a day). A person
gets it if their local time at that moment is between 08:00 and 22:59, which covers the Americas, Europe and
Africa, but not Australia or East Asia. They get at most one per local day. On the Pro plan, run the route
hourly (`"schedule": "0 * * * *"`, path `/api/push/expiring?mode=hourly`): each person then gets it between 17:00
and 18:59 their time, wherever they live.

**Testing without keys**: `npm run test` covers delivery with a fake sender. For a real device, build from
Xcode with `APNS_ENVIRONMENT=sandbox` on a preview deployment, turn notifications on in Household, then call
`curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/push/expiring` with something in the
pantry expiring tomorrow.

## When the domain changes

Update the URL in three places: `capacitor.config.ts`, `native/www/offline.html`, `native/www/index.html`.
Then run `npm run cap:sync` and ship a new build.
