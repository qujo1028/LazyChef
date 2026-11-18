import { describe, expect, it } from "vitest"

import { activeChallenge, challengeProgress, doneChallenges } from "./challenges"
import { cookDaySet, mergeCookEvents, toCookEvents, type CookEvent } from "./cook-days"
import { pickNudges, type NudgeInput } from "./nudges"
import { streakInfo, streakMilestone } from "./streak"
import { habitResult, summarize } from "./summary"
import { cookMilestone, nextTier, tierFor } from "./tiers"
import { cooksThisWeek, weekDayKeys } from "./week"

// 2026-11-16 is a Monday.
const MON = "2026-11-16"
const days = (...keys: string[]) => new Set(keys)
let batch = 0
const cook = (at: string, recipeKey: string | null = null): CookEvent => ({ batchId: ++batch, at, recipeKey })
const noon = (day: string) => `${day}T12:00:00Z`

describe("cook days", () => {
  it("groups rows into one event per batch", () => {
    const events = toCookEvents([
      { batchId: 1, createdAt: "2026-11-16T10:00:00Z", details: { recipe_id: 5, recipe_title: "Soup" } },
      { batchId: 1, createdAt: "2026-11-16T10:00:02Z", details: { recipe_id: 5, recipe_title: "Soup" } },
      { batchId: 2, createdAt: "2026-11-16T18:00:00Z", details: { recipe_title: "Toast" } },
    ])
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ batchId: 1, at: "2026-11-16T10:00:02Z", recipeKey: "id:5" })
    expect(events[1].recipeKey).toBe("title:toast")
  })

  it("two cooks on one day are one day", () => {
    const events = [cook("2026-11-16T09:00:00Z"), cook("2026-11-16T19:00:00Z")]
    expect(cookDaySet(events, "UTC").size).toBe(1)
  })

  it("uses the viewer's time zone for the day", () => {
    // 03:00 UTC on the 17th is still the evening of the 16th in Los Angeles.
    const events = [cook("2026-11-17T03:00:00Z")]
    expect([...cookDaySet(events, "America/Los_Angeles")]).toEqual(["2026-11-16"])
    expect([...cookDaySet(events, "UTC")]).toEqual(["2026-11-17"])
  })

  it("merges live events by batch id", () => {
    const a = { batchId: 1, at: "2026-11-16T09:00:00Z", recipeKey: null }
    const merged = mergeCookEvents([a], [{ ...a, at: "2026-11-16T09:00:05Z" }, { batchId: 2, at: "2026-11-16T10:00:00Z", recipeKey: null }])
    expect(merged).toHaveLength(2)
    expect(merged.find((e) => e.batchId === 1)?.at).toBe("2026-11-16T09:00:05Z")
  })
})

describe("week", () => {
  it("covers Monday to Sunday and counts distinct days", () => {
    expect(weekDayKeys("2026-11-18")[0]).toBe(MON)
    expect(weekDayKeys("2026-11-18")[6]).toBe("2026-11-22")
    expect(cooksThisWeek(days("2026-11-15", MON, "2026-11-17", "2026-11-23"), "2026-11-18")).toBe(2)
  })
})

describe("tiers and milestones", () => {
  it("tiers at 2, 4, 6 cook days", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tierFor)).toEqual([null, null, "bronze", "bronze", "silver", "silver", "gold", "gold"])
    expect(nextTier(2)).toEqual({ tier: "silver", at: 4 })
    expect(nextTier(6)).toBeNull()
  })

  const base = { cooksThisWeek: 1, streak: 1, challengesDone: [] as const }

  it("tier-up is a milestone", () => {
    expect(cookMilestone(base, { ...base, cooksThisWeek: 2, streak: 2 })).toEqual({ kind: "tier", tier: "bronze" })
  })

  it("a second cook on the same day is not a milestone", () => {
    const same = { cooksThisWeek: 2, streak: 2, challengesDone: [] as const }
    expect(cookMilestone(same, same)).toBeNull()
  })

  it("challenge beats streak beats tier", () => {
    const after = { cooksThisWeek: 2, streak: 3, challengesDone: ["streak3"] as const }
    expect(cookMilestone(base, after)).toEqual({ kind: "challenge", challenge: "streak3" })
    expect(cookMilestone(base, { ...after, challengesDone: [] })).toEqual({ kind: "streak", days: 3 })
  })
})

describe("streak", () => {
  it("matches the plain streak with no gaps", () => {
    expect(streakInfo(days("2026-11-16", "2026-11-17", "2026-11-18"), "2026-11-18")).toEqual({ count: 3, forgave: false, atRisk: false })
  })

  it("stays alive until tonight and is then at risk", () => {
    expect(streakInfo(days("2026-11-16", "2026-11-17"), "2026-11-18")).toEqual({ count: 2, forgave: false, atRisk: true })
  })

  it("forgives one missed day per Monday-week", () => {
    // Mon, Tue, (Wed missed), Thu: the run survives.
    expect(streakInfo(days("2026-11-16", "2026-11-17", "2026-11-19"), "2026-11-19")).toMatchObject({ count: 3, forgave: true })
  })

  it("does not forgive a second miss in the same week", () => {
    // Mon, (Tue missed), Wed, (Thu missed), Fri: stops at the second miss.
    expect(streakInfo(days("2026-11-16", "2026-11-18", "2026-11-20"), "2026-11-20").count).toBe(2)
  })

  it("two missed days in a row break it", () => {
    expect(streakInfo(days("2026-11-16", "2026-11-19"), "2026-11-19").count).toBe(1)
  })

  it("milestones at 3, 7, 14, 30", () => {
    expect(streakMilestone(2, 3)).toBe(3)
    expect(streakMilestone(3, 4)).toBeNull()
    expect(streakMilestone(6, 7)).toBe(7)
    expect(streakMilestone(13, 14)).toBe(14)
    expect(streakMilestone(29, 30)).toBe(30)
  })
})

describe("challenges", () => {
  it("streak3 progresses with the open run and sticks once done", () => {
    const two = days(MON, "2026-11-17")
    expect(challengeProgress("streak3", [], two, "2026-11-17")).toMatchObject({ progress: 2, done: false, label: "2 of 3 nights" })
    const three = days(MON, "2026-11-17", "2026-11-18")
    expect(challengeProgress("streak3", [], three, "2026-11-18")).toMatchObject({ progress: 3, done: true })
    // Still done on Friday even though the run ended.
    expect(challengeProgress("streak3", [], three, "2026-11-20")).toMatchObject({ done: true })
  })

  it("streak3 does not count last week", () => {
    expect(challengeProgress("streak3", [], days("2026-11-14", "2026-11-15"), MON).progress).toBe(0)
  })

  it("try_new needs a recipe never cooked before, cooked this week", () => {
    const old = cook(noon("2026-11-10"), "id:1")
    const again = cook(noon("2026-11-17"), "id:1")
    const fresh = cook(noon("2026-11-17"), "id:2")
    const d = (events: CookEvent[]) => cookDaySet(events, "UTC")
    expect(challengeProgress("try_new", [old, again], d([old, again]), "2026-11-18", "UTC").done).toBe(false)
    expect(challengeProgress("try_new", [old, fresh], d([old, fresh]), "2026-11-18", "UTC").done).toBe(true)
    // A cook with no recipe never counts.
    const quick = cook(noon("2026-11-17"), null)
    expect(challengeProgress("try_new", [quick], d([quick]), "2026-11-18", "UTC").done).toBe(false)
  })

  it("the active challenge is the first not done", () => {
    const events = [cook(noon("2026-11-16"), "id:9")]
    const d = cookDaySet(events, "UTC")
    expect(activeChallenge(events, d, "2026-11-18", "UTC")?.kind).toBe("streak3")
    const full = [cook(noon("2026-11-16"), "id:1"), cook(noon("2026-11-17"), "id:2"), cook(noon("2026-11-18"), "id:3")]
    const fd = cookDaySet(full, "UTC")
    expect(doneChallenges(full, fd, "2026-11-18", "UTC")).toEqual(["streak3", "try_new"])
    expect(activeChallenge(full, fd, "2026-11-18", "UTC")).toBeNull()
  })
})

describe("summary", () => {
  it("an empty history is a first-cook state", () => {
    const s = summarize([], Date.parse("2026-11-18T12:00:00Z"), "UTC")
    expect(s).toMatchObject({ cooksThisWeek: 0, tier: null, daysSinceLastCook: null, comeback: false })
    expect(s.streak.count).toBe(0)
  })

  it("comeback after 3 quiet days", () => {
    const s = summarize([cook(noon("2026-11-12"))], Date.parse("2026-11-18T12:00:00Z"), "UTC")
    expect(s.daysSinceLastCook).toBe(6)
    expect(s.comeback).toBe(true)
    expect(summarize([cook(noon("2026-11-16"))], Date.parse("2026-11-18T12:00:00Z"), "UTC").comeback).toBe(false)
  })

  it("habitResult: first cook of the day can tier up, a second cook cannot", () => {
    const now = Date.parse("2026-11-17T20:00:00Z")
    const first = cook(noon("2026-11-16"), "id:1")
    const before = summarize([first], now, "UTC")
    const second = cook("2026-11-17T20:00:00Z", "id:2")
    const after = summarize([first, second], now, "UTC")
    expect(habitResult(before, after)).toMatchObject({
      cooksThisWeek: 2,
      tierBefore: null,
      tierAfter: "bronze",
      streakBefore: 1,
      streakAfter: 2,
      milestone: { kind: "tier", tier: "bronze" },
    })
    const again = cook("2026-11-17T21:00:00Z", "id:3")
    const afterAgain = summarize([first, second, again], now, "UTC")
    expect(habitResult(after, afterAgain).milestone).toBeNull()
  })
})

describe("nudges", () => {
  const none: NudgeInput = { expiring: { count: 0, first: null }, almost: null, comeback: false, firstCook: null }
  const all: NudgeInput = {
    expiring: { count: 1, first: "Spinach" },
    almost: { id: "7", title: "Omelet", missing: "cheese" },
    comeback: true,
    firstCook: { id: "8", title: "Pasta" },
  }

  it("says nothing when nothing applies", () => {
    expect(pickNudges(none, new Set(), MON)).toEqual([])
  })

  it("keeps priority order and at most two", () => {
    expect(pickNudges(all, new Set(), MON).map((n) => n.id)).toEqual(["expiring", "almost"])
  })

  it("dismissed nudges are skipped for that day only", () => {
    expect(pickNudges(all, new Set([`${MON}:expiring`]), MON).map((n) => n.id)).toEqual(["almost", "comeback"])
    expect(pickNudges(all, new Set([`${MON}:expiring`]), "2026-11-17").map((n) => n.id)).toEqual(["expiring", "almost"])
  })

  it("uses a plural line for several expiring items", () => {
    expect(pickNudges({ ...none, expiring: { count: 3, first: "Milk" } }, new Set(), MON)[0].text).toBe("3 things are about to expire.")
  })
})
