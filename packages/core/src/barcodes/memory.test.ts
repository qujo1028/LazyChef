import { describe, expect, it } from "vitest"

import { barcodeMemories } from "./memory"

describe("barcodeMemories", () => {
  const packages = new Map([
    ["0041303000526", { quantity: 24, unit: "count" }],
    ["0070038000563", { quantity: 1, unit: "gal" }],
    ["0000000000017", { quantity: null, unit: "count" }],
  ])

  it("remembers the name it was added as, and one package's amount", () => {
    expect(
      barcodeMemories(
        [
          { code: "0041303000526", name: "Brown Eggs ", quantity: 48, unit: "count" }, // two cartons
          { code: "0070038000563", name: "whole milk", quantity: 4, unit: "l" }, // unit changed
          { code: "0000000000017", name: "oat milk", quantity: 2, unit: "count" }, // no size scanned
        ],
        packages,
      ),
    ).toEqual([
      { code: "0041303000526", name: "brown eggs", quantity: 24, unit: "count" },
      { code: "0070038000563", name: "whole milk", quantity: 4, unit: "l" },
      { code: "0000000000017", name: "oat milk", quantity: 2, unit: "count" },
    ])
  })

  it("keeps one entry per code (the last)", () => {
    expect(
      barcodeMemories(
        [
          { code: "0041303000526", name: "eggs", quantity: 24, unit: "count" },
          { code: "0041303000526", name: "large eggs", quantity: 24, unit: "count" },
        ],
        packages,
      ),
    ).toEqual([{ code: "0041303000526", name: "large eggs", quantity: 24, unit: "count" }])
  })
})
