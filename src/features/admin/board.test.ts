import { describe, expect, it } from "vitest"

import { ageLabel, columnFor, labelsForMove, linkedIssues, reviewStateFor } from "./board"

describe("columnFor", () => {
  it("sorts by state and status label", () => {
    expect(columnFor({ state: "open", labels: ["bug"] })).toBe("backlog")
    expect(columnFor({ state: "open", labels: ["status: next"] })).toBe("next")
    expect(columnFor({ state: "open", labels: ["status: in-progress", "status: next"] })).toBe("in-progress")
    expect(columnFor({ state: "closed", labels: ["status: next"] })).toBe("done")
  })
})

describe("labelsForMove", () => {
  it("swaps status labels and keeps the rest", () => {
    expect(labelsForMove(["bug", "status: next"], "in-progress")).toEqual(["bug", "status: in-progress"])
    expect(labelsForMove(["bug", "status: next", "Status: in-progress"], "backlog")).toEqual(["bug"])
    expect(labelsForMove([], "next")).toEqual(["status: next"])
  })
})

describe("linkedIssues", () => {
  it("parses closing keywords", () => {
    expect(linkedIssues("Fixes #3, closes #4 and Resolved #5. Also fix #3. See #9")).toEqual([3, 4, 5])
    expect(linkedIssues(null)).toEqual([])
  })
})

describe("ageLabel", () => {
  const now = "2026-11-17T12:00:00Z"
  it("shortens", () => {
    expect(ageLabel("2026-11-17T11:59:30Z", now)).toBe("now")
    expect(ageLabel("2026-11-17T11:00:00Z", now)).toBe("1h")
    expect(ageLabel("2026-11-14T12:00:00Z", now)).toBe("3d")
    expect(ageLabel("2026-10-17T12:00:00Z", now)).toBe("4w")
    expect(ageLabel("2025-11-01T12:00:00Z", now)).toBe("1y")
  })
})

describe("reviewStateFor", () => {
  it("uses each reviewer's latest decision", () => {
    expect(reviewStateFor([])).toBe("review_needed")
    expect(reviewStateFor([{ user: "a", state: "COMMENTED" }])).toBe("review_needed")
    expect(reviewStateFor([{ user: "a", state: "CHANGES_REQUESTED" }, { user: "a", state: "APPROVED" }])).toBe("approved")
    expect(reviewStateFor([{ user: "a", state: "APPROVED" }, { user: "b", state: "CHANGES_REQUESTED" }])).toBe("changes_requested")
    expect(reviewStateFor([{ user: "a", state: "APPROVED" }, { user: "a", state: "DISMISSED" }])).toBe("review_needed")
  })
})
