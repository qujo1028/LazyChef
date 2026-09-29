import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { PENDING_INVITE_COOKIE } from "@/lib/invite"
import { safeNext } from "@/lib/safe-next"
import type { Database } from "@/types/database"
import { getSupabaseConfig, secureCookies } from "./config"

/** Reachable without signing in. Everything else redirects to /login. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"]
/** Signed-in users skip these and go straight to where they were headed. */
const SIGNED_OUT_ONLY = ["/login", "/signup", "/forgot-password"]
const INVITE_PATH = /^\/join\/([^/]+)$/

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Refreshes the Supabase session cookie on every request and gates routes.
 * Pages still check auth themselves; this is the first line, not the only one.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseConfig()

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: { secure: secureCookies() },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        // Keeps CDNs from caching a response that carries someone's session.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Nothing may run between createServerClient and getClaims(): this call
  // refreshes the session, and code in between causes random sign-outs.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const { pathname, search, searchParams } = request.nextUrl

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) {
    const invite = pathname.match(INVITE_PATH)?.[1]
    const target = request.nextUrl.clone()
    target.pathname = invite ? "/signup" : "/login"
    target.search = ""
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`)

    const redirect = redirectKeepingSession(target, response)
    if (invite) {
      // Survives an email-confirmation round trip, which drops ?next=.
      redirect.cookies.set(PENDING_INVITE_COOKIE, invite, {
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
        httpOnly: true,
        secure: secureCookies(),
      })
    }
    return redirect
  }

  if (signedIn && matches(pathname, SIGNED_OUT_ONLY)) {
    const target = new URL(safeNext(searchParams.get("next")), request.url)
    return redirectKeepingSession(target, response)
  }

  return response
}

function redirectKeepingSession(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(key)
    if (value) redirect.headers.set(key, value)
  }
  return redirect
}
