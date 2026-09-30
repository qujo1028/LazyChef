import { describe, expect, it } from "vitest"

import { parseLine } from "@/lib/ingredients/parse-line"

import { expandUpcE, normalizeBarcode, packageSize, productToScan, scanLine } from "./product"

describe("normalizeBarcode", () => {
  it("accepts EAN-13, and turns UPC-A and GTIN-14 into the same 13 digits", () => {
    expect(normalizeBarcode("3017620422003")).toBe("3017620422003") // Nutella, EAN-13
    expect(normalizeBarcode("041303000526")).toBe("0041303000526") // UPC-A
    expect(normalizeBarcode("0 41303 00052 6")).toBe("0041303000526")
    expect(normalizeBarcode("00041303000526")).toBe("0041303000526") // GTIN-14
  })

  it("accepts EAN-8, and expands UPC-E to the same code as its UPC-A", () => {
    expect(normalizeBarcode("96385074")).toBe("96385074") // EAN-8
    expect(expandUpcE("04252614")).toBe("042100005264")
    expect(normalizeBarcode("04252614")).toBe("0042100005264")
    expect(normalizeBarcode("042100005264")).toBe("0042100005264")
  })

  it("rejects bad check digits, wrong lengths and non-digits", () => {
    expect(normalizeBarcode("3017620422004")).toBeNull()
    expect(normalizeBarcode("12345")).toBeNull()
    expect(normalizeBarcode("abc12345678")).toBeNull()
    expect(normalizeBarcode("")).toBeNull()
    expect(normalizeBarcode("10041303000523")).toBeNull() // GTIN-14 for a case, not a single item
  })
})

describe("packageSize", () => {
  it("reads the package amount", () => {
    expect(packageSize("24 ct")).toEqual({ quantity: 24, unit: "count" })
    expect(packageSize("1 gal (3.78 L)")).toEqual({ quantity: 1, unit: "gal" })
    expect(packageSize("2 x 200 g")).toEqual({ quantity: 400, unit: "g" })
    expect(packageSize("400g")).toEqual({ quantity: 400, unit: "g" })
    expect(packageSize("400 g e")).toEqual({ quantity: 400, unit: "g" })
    expect(packageSize("18 oz (510 g)")).toEqual({ quantity: 18, unit: "oz" })
  })
  it("gives up on what isn't an amount", () => {
    expect(packageSize(undefined)).toEqual({ quantity: null, unit: "count" })
    expect(packageSize("family size")).toEqual({ quantity: null, unit: "count" })
  })
})

describe("productToScan", () => {
  it("names it the pantry way, without the brand", () => {
    expect(
      productToScan({ product_name: "Kirkland Signature Large Brown Eggs", brands: "Kirkland Signature", quantity: "24 ct" }),
    ).toEqual({ name: "eggs", quantity: 24, unit: "count", label: "Kirkland Signature Large Brown Eggs" })
    expect(productToScan({ product_name: "Barilla Spaghetti", brands: "Barilla", quantity: "16 oz" })).toMatchObject({
      name: "spaghetti",
      quantity: 16,
      unit: "oz",
    })
  })

  it("tries every name (the English one too), then the categories", () => {
    expect(productToScan({ product_name: "Lait entier", product_name_en: "Whole milk", quantity: "1 L" })).toMatchObject({
      name: "whole milk",
      quantity: 1,
      unit: "l",
    })
    expect(
      productToScan({ product_name: "Kirkland Organic 2", brands: "Kirkland", categories_tags: ["en:dairies", "en:milks", "en:whole-milks"] }),
    ).toMatchObject({ name: "whole milk" })
  })

  it("keeps an unknown product's name, minus the brand and printed size, and adds the brand to the label", () => {
    expect(productToScan({ product_name: "Zesty Ranch Crunchers 12 oz", brands: "Snackco" })).toEqual({
      name: "zesty ranch crunchers",
      quantity: null,
      unit: "count",
      label: "Snackco Zesty Ranch Crunchers 12 oz",
    })
  })

  it("labels it with the name on the package, not an odd English field", () => {
    expect(
      productToScan({ product_name: "Cheerios", product_name_en: "My Bff", brands: "Cheerios", quantity: "18 oz (510 g)" }),
    ).toEqual({ name: "cheerios", quantity: 18, unit: "oz", label: "Cheerios" })
    expect(productToScan({ product_name: "Nutella", brands: "Nutella, Ferrero", quantity: "400 g e" })).toMatchObject({
      name: "nutella",
      quantity: 400,
      unit: "g",
    })
  })

  it("returns null when there's no name at all", () => {
    expect(productToScan({ brands: "Somebody", quantity: "1 kg" })).toBeNull()
  })
})

describe("scanLine", () => {
  it("writes a line the add-food parser reads back the same way", () => {
    for (const scan of [
      { name: "eggs", quantity: 24, unit: "count" },
      { name: "whole milk", quantity: 1, unit: "gal" },
      { name: "spaghetti", quantity: 500, unit: "g" },
      { name: "juice", quantity: 1.5, unit: "l" },
      { name: "soda", quantity: 12, unit: "fl oz" },
      { name: "peanut butter", quantity: 0.5, unit: "lb" },
    ]) {
      const line = parseLine(scanLine(scan))
      expect(line, scanLine(scan)).toMatchObject({ name: scan.name, quantity: scan.quantity, unit: scan.unit })
    }
    expect(scanLine({ name: "salt, sea", quantity: null, unit: "count" })).toBe("salt sea")
  })
})
