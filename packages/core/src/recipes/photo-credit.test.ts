import { describe, expect, it } from "vitest"

import { photoCredit } from "./photo-credit"

describe("photoCredit", () => {
  it("names the author and license with links", () => {
    expect(
      photoCredit({
        image_author: " Jane  Doe ",
        image_license: "CC BY-SA 4.0",
        image_license_url: "https://creativecommons.org/licenses/by-sa/4.0",
        image_source_url: "https://commons.wikimedia.org/wiki/File:Mac.jpg",
      }),
    ).toEqual({
      kind: "licensed",
      text: "Photo: Jane Doe, CC BY-SA 4.0",
      href: "https://commons.wikimedia.org/wiki/File:Mac.jpg",
      licenseHref: "https://creativecommons.org/licenses/by-sa/4.0",
    })
  })

  it("labels AI images", () => {
    expect(photoCredit({ image_ai_generated: true, image_author: "x" })).toEqual({ kind: "ai", text: "AI-generated image" })
  })

  it("shows public domain photos without an author, and nothing for uncredited rows", () => {
    expect(photoCredit({ image_license: "Public domain", image_source_url: "http://insecure" })).toMatchObject({
      text: "Photo: Public domain",
      href: null,
    })
    expect(photoCredit({})).toBeNull()
  })
})
