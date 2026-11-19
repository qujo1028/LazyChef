import { describe, expect, it } from "vitest"

import { PHOTO_COLUMNS, splitPhotoRows } from "./keep-photos"

const row = (id: string) => ({
  source_id: id,
  title: `Dish ${id}`,
  image_url: `https://example.com/${id}.jpg`,
  image_author: "A",
  image_license: "CC BY 4.0",
  image_license_url: null,
  image_source_url: null,
  image_ai_generated: false,
})

describe("splitPhotoRows", () => {
  it("writes new rows in full", () => {
    const { full, keepPhoto } = splitPhotoRows([row("1"), row("2")], new Set())
    expect(full.map((r) => r.source_id)).toEqual(["1", "2"])
    expect(keepPhoto).toEqual([])
  })

  it("drops every photo column from rows that already have a photo", () => {
    const { full, keepPhoto } = splitPhotoRows([row("1"), row("2")], new Set(["2"]))
    expect(full.map((r) => r.source_id)).toEqual(["1"])
    expect(keepPhoto).toEqual([{ source_id: "2", title: "Dish 2" }])
    for (const column of PHOTO_COLUMNS) expect(keepPhoto[0]).not.toHaveProperty(column)
  })

  it("leaves the input rows untouched", () => {
    const input = [row("1")]
    splitPhotoRows(input, new Set(["1"]))
    expect(input[0].image_url).toBe("https://example.com/1.jpg")
  })
})
