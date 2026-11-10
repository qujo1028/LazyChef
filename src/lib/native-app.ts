import { Capacitor } from "@capacitor/core"

/** True inside the LazyChef iOS/Android app, false in any browser. */
export function isNativeApp() {
  return Capacitor.isNativePlatform()
}
