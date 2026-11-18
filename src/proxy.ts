import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, metadata files (icons, manifest), public/vendor (the barcode reader)
    // the RevenueCat webhook and the cron routes (no session; each checks its own Authorization header).
    "/((?!_next/static|_next/image|vendor/|api/revenuecat/|api/admin/snapshot|api/push/expiring|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
}
