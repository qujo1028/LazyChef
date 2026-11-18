/**
 * URLs that used to be their own screens and now live inside one of the five tab screens.
 * Old bookmarks, push notifications and shared links keep working through these permanent
 * redirects (next.config.ts). Next passes the request's own query string through, so
 * /pantry/add?text=milk lands on /pantry?add=bulk&text=milk.
 */
export const LEGACY_REDIRECTS = [
  { source: "/pantry/add", destination: "/pantry?add=bulk" },
  { source: "/recipes/saved", destination: "/recipes?view=saved" },
  { source: "/recipes/ours", destination: "/recipes?view=ours" },
  { source: "/recipes/new", destination: "/recipes?view=ours&new=1" },
  { source: "/recipes/:id/edit", destination: "/recipes/:id?edit=1" },
  { source: "/activity/stats", destination: "/activity?view=stats" },
  { source: "/pro", destination: "/household?pro=1" },
] as const satisfies readonly { source: string; destination: string }[]

/** In the shape next.config.ts wants. */
export function legacyRedirects() {
  return LEGACY_REDIRECTS.map((route) => ({ ...route, permanent: true }))
}
