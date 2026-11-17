/** The click details that decide whether a link tap is a plain "open this" tap. */
export type LinkClick = {
  button: number
  defaultPrevented: boolean
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * The URL to show in the in-app browser for a tapped link, or null to let the
 * WebView handle it (same-site pages, mailto:, tel:, modified clicks, downloads).
 */
export function inAppBrowserUrl(
  href: string | null,
  baseUrl: string,
  click: LinkClick,
  isDownload = false,
): string | null {
  if (!href || isDownload) return null
  if (click.defaultPrevented || click.button !== 0) return null
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null

  let url: URL
  try {
    url = new URL(href, baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.origin === new URL(baseUrl).origin) return null
  return url.href
}
