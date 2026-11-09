import type { CapacitorConfig } from "@capacitor/cli"

// The iOS and Android apps are native shells around the live site: every page is built on
// the server (server components and server actions), so the web app can't be bundled into
// the app. Native plugins (RevenueCat purchases now; push and sign-in later) talk to the page
// through Capacitor's bridge.
//
// CAP_SERVER_URL points the app somewhere else while developing, e.g.
//   CAP_SERVER_URL=http://localhost:3000 npx cap run ios
// then run `npx cap sync` again before a release build so it points back at production.

const PRODUCTION_URL = "https://lazychef-gamma.vercel.app"
const serverUrl = process.env.CAP_SERVER_URL?.trim() || PRODUCTION_URL

const config: CapacitorConfig = {
  appId: "com.qujo1028.lazychef",
  appName: "LazyChef",
  // Only the offline page lives in the app itself.
  webDir: "mobile/www",
  // Lets the server tell app visits from browser visits.
  appendUserAgent: "LazyChefApp",
  backgroundColor: "#ffffff",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    // Shown when the site can't load (no connection).
    errorPath: "offline.html",
  },
  ios: {
    // The page handles the notch and home bar itself with env(safe-area-inset-*).
    contentInset: "never",
  },
}

export default config
