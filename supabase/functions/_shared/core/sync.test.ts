import { describe, expect, it } from "vitest"

import { staleCopies } from "../../../../scripts/sync-edge-shared.mjs"

describe("Edge Function copies of shared modules", () => {
  it("match their sources (run node scripts/sync-edge-shared.mjs if this fails)", () => {
    expect(staleCopies()).toEqual([])
  })
})
