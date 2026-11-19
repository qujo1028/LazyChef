// The credit line under a library recipe's photo. Freely licensed photos (Wikimedia Commons)
// must name the author and license and link to the source wherever they show; AI images say so.
// Pure, shared by the web and mobile recipe pages.

export type PhotoCreditFields = {
  image_author?: string | null
  image_license?: string | null
  image_license_url?: string | null
  image_source_url?: string | null
  image_ai_generated?: boolean | null
}

export type PhotoCredit =
  | { kind: "ai"; text: string }
  | {
      kind: "licensed"
      /** "Photo: Jane Doe, CC BY-SA 4.0" */
      text: string
      /** The photo's page (author and license details). */
      href: string | null
      /** The license deed. */
      licenseHref: string | null
    }

const AI_TEXT = "AI-generated image"

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function https(value: string | null | undefined): string | null {
  const raw = clean(value)
  return /^https:\/\//i.test(raw) ? raw : null
}

/** Null when the row has no credit to show (TheMealDB, household or Spoonacular photos). */
export function photoCredit(row: PhotoCreditFields): PhotoCredit | null {
  if (row.image_ai_generated) return { kind: "ai", text: AI_TEXT }
  const license = clean(row.image_license)
  const author = clean(row.image_author)
  if (!license && !author) return null
  const parts = [author, license].filter(Boolean).join(", ")
  return {
    kind: "licensed",
    text: `Photo: ${parts}`,
    href: https(row.image_source_url),
    licenseHref: https(row.image_license_url),
  }
}
