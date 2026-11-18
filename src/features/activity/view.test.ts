import { describe, expect, it } from "vitest"

import { parseActivityView } from "./view"

describe("parseActivityView", () => {
  it("reads the three views and defaults to the log", () => {
    expect(parseActivityView("log")).toBe("log")
    expect(parseActivityView("chart")).toBe("chart")
    expect(parseActivityView("board")).toBe("board")
    expect(parseActivityView(undefined)).toBe("log")
    expect(parseActivityView("nope")).toBe("log")
    expect(parseActivityView("toString")).toBe("log")
  })

  it("keeps ?view=stats working as the chart", () => {
    expect(parseActivityView("stats")).toBe("chart")
    expect(parseActivityView(["stats", "board"])).toBe("chart")
  })
})
