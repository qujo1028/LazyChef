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
  the server for Google's URL and opens it in an in-app browser tab. Supabase sends the user back to
  `app.lazychef://auth/callback?code=…`, the app closes the tab and loads `/auth/callback` in its own web view,
  which holds the sign-in cookies. On iOS, Safari asks "Open in LazyChef?" before returning. Moving to
  `ASWebAuthenticationSession` (or native Google Sign-In) would remove that prompt.
- **Camera**: the web barcode scanner works in the app. iOS shows the `NSCameraUsageDescription` text and
  Android asks for the camera permission the first time.
- **iPhone only, portrait only** for now (as the launch checklist recommends). iPad can come later.
- Links to other websites (recipe sources, credits) open in the phone's browser, not inside the app.

## When the domain changes

Update the URL in three places: `capacitor.config.ts`, `native/www/offline.html`, `native/www/index.html`.
Then run `npm run cap:sync` and ship a new build.
