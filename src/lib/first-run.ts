/**
 * Set once someone leaves the welcome tour (finished, skipped or "I already have an
 * account"). Signed-out visits to / go to /welcome until it's there, then to /login.
 * Not httpOnly: the tour sets it from the browser.
 */
export const TOUR_COOKIE = "lc_tour"

export function markTourSeen() {
  document.cookie = `${TOUR_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
}
