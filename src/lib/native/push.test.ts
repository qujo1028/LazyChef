import { describe, expect, it } from "vitest"

import { safePushPath } from "./push"

describe("safePushPath", () => {
  it("allows same-site paths", () => {
    expect(safePushPath("/pantry")).toBe("/pantry")
    expect(safePushPath("/list")).toBe("/list")
    expect(safePushPath("/household?welcome=1")).toBe("/household?welcome=1")
  })

  it("rejects everything else", () => {
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "pantry",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "",
      null,
      undefined,
      42,
      {},
      `/${"a".repeat(300)}`,
    ]) {
      expect(safePushPath(bad)).toBeNull()
    }
  })
})
