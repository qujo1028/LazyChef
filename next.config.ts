import path from "node:path"

import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

function origin(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL)

/**
 * Content-Security-Policy. Scripts and styles only from this site (Next.js and next-themes
 * need inline ones; nonces would force every page to render per request). Data goes only
 * to this site and Supabase (including the realtime websocket). Images come from here,
 * Spoonacular and Google profile photos. Vercel Analytics and Speed Insights are served
 * from this site's own /_vercel path.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.spoonacular.com https://spoonacular.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  ["connect-src 'self'", supabase, supabase?.replace(/^http/, "ws"), isDev ? "ws://localhost:*" : null]
    .filter(Boolean)
    .join(" "),
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  // No form-action: "Continue with Google" is a form whose server action redirects to Supabase.
].join("; ")

const nextConfig: NextConfig = {
  // A package-lock.json in a parent folder would otherwise be mistaken for the root.
  turbopack: { root: path.join(__dirname) },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in the app is meant to be embedded; blocks clickjacking (frame-ancestors too).
          { key: "X-Frame-Options", value: "DENY" },
          // Always HTTPS for two years. Browsers ignore it on http://localhost.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ]
  },
}

export default nextConfig
