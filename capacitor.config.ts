import type { CapacitorConfig } from "@capacitor/cli"

/**
 * The iOS and Android apps are a native shell around the live site: pages, server actions and
 * server-only keys stay on Vercel, so web fixes reach the apps without a new build.
 *
 * CAP_SERVER_URL points a dev build at another server, e.g. `http://192.168.1.20:3000` for
 * `next dev` on this Mac (run `npx cap sync` after changing it). Keep this URL in step with
 * native/www/offline.html and native/www/index.html.
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://lazychef-gamma.vercel.app"

const config: CapacitorConfig = {
  appId: "app.lazychef",
  appName: "LazyChef",
  // Only the fallback pages live here; the app itself loads from serverUrl.
  webDir: "native/www",
  // Lets the site tell the app apart from a phone browser (e.g. in logs).
  appendUserAgent: "LazyChefApp",
  backgroundColor: "#fbf8f1",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    // Shown when the site can't load (no signal at the store), instead of a blank screen.
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
  },
}

export default config
