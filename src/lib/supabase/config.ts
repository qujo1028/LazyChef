// Both values are public by design (they ship to the browser); RLS protects the data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export function getSupabaseConfig() {
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.",
    )
  }
  return { url, publishableKey }
}

/**
 * Marks auth cookies Secure wherever the site is served over HTTPS: Vercel
 * production/preview on the server, the page's own protocol in the browser.
 * Local http://localhost (including `next start`) keeps plain cookies.
 */
export function secureCookies() {
  if (typeof window !== "undefined") return window.location.protocol === "https:"
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
}
