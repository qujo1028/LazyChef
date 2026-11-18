import { describe, expect, it } from "vitest"

import { cookDaysByActor, type CookRow } from "./cook-days"
import { computeLeaderboard, type BoardMember } from "./leaderboard"

const members: BoardMember[] = [
  { userId: "alex", displayName: "Alex", avatarUrl: null },
  { userId: "blair", displayName: "Blair", avatarUrl: null },
  { userId: "casey", displayName: "Casey", avatarUrl: null },
]

function cook(createdAt: string, actorId: string, action = "cooked"): CookRow {
  return { action, actorId, createdAt }
}

// Wednesday, Nov 4 2026 noon in New York. The week started Monday Nov 2.
const NOW = Date.parse("2026-11-04T17:00:00Z")
const NY = "America/New_York"

describe("cookDaysByActor", () => {
  it("collapses many rows and cooks on one day into one day", () => {
    const rows = [
      cook("2026-11-03T15:00:00Z", "alex"),
      cook("2026-11-03T15:00:00Z", "alex"),
      cook("2026-11-03T23:00:00Z", "alex"),
      cook("2026-11-03T15:00:00Z", "alex", "shopped"),
      { action: "cooked", actorId: null, createdAt: "2026-11-03T15:00:00Z" },
    ]
    const days = cookDaysByActor(rows, NY)
    expect([...days.keys()]).toEqual(["alex"])
    expect([...days.get("alex")!]).toEqual(["2026-11-03"])
  })

  it("uses the viewer's time zone for the day", () => {
    const rows = [cook("2026-11-03T03:30:00Z", "alex")]
    expect([...cookDaysByActor(rows, "UTC").get("alex")!]).toEqual(["2026-11-03"])
    expect([...cookDaysByActor(rows, NY).get("alex")!]).toEqual(["2026-11-02"])
  })
})

describe("computeLeaderboard", () => {
  it("counts cook days, not batches, for the week and all time", () => {
    const rows = [
      cook("2026-11-02T20:00:00Z", "alex"),
      cook("2026-11-02T22:00:00Z", "alex"), // same day
      cook("2026-11-03T20:00:00Z", "alex"),
      cook("2026-10-20T20:00:00Z", "alex"),
      cook("2026-11-03T20:00:00Z", "blair"),
    ]
    const board = computeLeaderboard(rows, members, NOW, NY)
    const alex = board.weekly.find((e) => e.userId === "alex")!
    expect(alex.week).toBe(2)
    expect(alex.allTime).toBe(3)
    expect(board.weekly.find((e) => e.userId === "blair")).toMatchObject({ week: 1, allTime: 1 })
    expect(board.weekStart).toBe("2026-11-02")
  })

  it("lists members with no cooks at zero", () => {
    const board = computeLeaderboard([], members, NOW, NY)
    expect(board.weekly).toHaveLength(3)
    expect(board.weekly.every((e) => e.week === 0 && e.allTime === 0 && e.weekRank === 1)).toBe(true)
    expect(board.lastWeekWinners).toEqual([])
  })

  it("ignores people who are no longer members", () => {
    const board = computeLeaderboard([cook("2026-11-03T20:00:00Z", "ghost")], members, NOW, NY)
    expect(board.weekly.map((e) => e.userId)).not.toContain("ghost")
  })

  it("shares a rank on ties and orders by all-time, then name", () => {
    const rows = [
      // This week: alex 1, blair 1, casey 1. All time: casey 3, alex 2, blair 2.
      cook("2026-11-03T20:00:00Z", "alex"),
      cook("2026-10-01T20:00:00Z", "alex"),
      cook("2026-11-03T20:00:00Z", "blair"),
      cook("2026-10-02T20:00:00Z", "blair"),
      cook("2026-11-03T20:00:00Z", "casey"),
      cook("2026-10-03T20:00:00Z", "casey"),
      cook("2026-10-04T20:00:00Z", "casey"),
    ]
    const board = computeLeaderboard(rows, members, NOW, NY)
    expect(board.weekly.map((e) => [e.name, e.weekRank])).toEqual([
      ["Casey", 1],
      ["Alex", 1],
      ["Blair", 1],
    ])
    expect(board.allTime.map((e) => [e.name, e.allTimeRank])).toEqual([
      ["Casey", 1],
      ["Alex", 2],
      ["Blair", 2],
    ])
  })

  it("skips a rank after a tie (1, 1, 3)", () => {
    const rows = [
      cook("2026-11-02T20:00:00Z", "alex"),
      cook("2026-11-03T20:00:00Z", "alex"),
      cook("2026-11-02T20:00:00Z", "blair"),
      cook("2026-11-03T20:00:00Z", "blair"),
      cook("2026-11-03T20:00:00Z", "casey"),
    ]
    const board = computeLeaderboard(rows, members, NOW, NY)
    expect(board.weekly.map((e) => e.weekRank)).toEqual([1, 1, 3])
  })

  it("names last week's winner, with co-winners on a tie, and none when nobody cooked", () => {
    const rows = [
      cook("2026-10-27T20:00:00Z", "alex"),
      cook("2026-10-28T20:00:00Z", "alex"),
      cook("2026-10-27T20:00:00Z", "blair"),
    ]
    expect(computeLeaderboard(rows, members, NOW, NY).lastWeekWinners.map((e) => e.name)).toEqual(["Alex"])

    const tie = [...rows, cook("2026-10-29T20:00:00Z", "blair")]
    expect(
      computeLeaderboard(tie, members, NOW, NY)
        .lastWeekWinners.map((e) => e.name)
        .sort(),
    ).toEqual(["Alex", "Blair"])
  })

  it("draws the week boundary in the viewer's zone", () => {
    // 11:30 PM Sunday Nov 1 in New York is already Monday in UTC: last week for the viewer.
    const rows = [cook("2026-11-02T04:30:00Z", "alex")]
    const ny = computeLeaderboard(rows, members, NOW, NY)
    expect(ny.weekly.find((e) => e.userId === "alex")).toMatchObject({ week: 0, wonLastWeek: true })
    const utc = computeLeaderboard(rows, members, NOW, "UTC")
    expect(utc.weekly.find((e) => e.userId === "alex")).toMatchObject({ week: 1, wonLastWeek: false })
  })

  it("counts quick logs and recipe-less cooks like any other 'cooked' row", () => {
    // Only action, actor and time matter: nothing here has a recipe id.
    const board = computeLeaderboard([cook("2026-11-03T20:00:00Z", "casey")], members, NOW, NY)
    expect(board.weekly[0]).toMatchObject({ name: "Casey", week: 1 })
  })

  it("is not thrown off by the fall-back day in last week's count", () => {
    const rows = [
      cook("2026-11-01T05:30:00Z", "alex"), // 1:30 AM EDT
      cook("2026-11-01T06:30:00Z", "alex"), // 1:30 AM EST, same local day
    ]
    const board = computeLeaderboard(rows, members, NOW, NY)
    expect(board.weekly.find((e) => e.userId === "alex")?.allTime).toBe(1)
  })
})
