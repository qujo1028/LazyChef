import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { rewardBeats, rewardDuration, scheduleReward, type RewardBeat } from "./reward"

describe("rewardBeats", () => {
  it("cook is four beats, ending in success + flame, in time order", () => {
    const beats = rewardBeats("cook")
    expect(beats.map((b) => b.at)).toEqual([0, 120, 260, 420])
    expect(beats.at(-1)).toMatchObject({ haptic: "success", visual: "flame" })
    expect(beats.some((b) => b.visual === "confetti")).toBe(false)
  })

  it("milestone escalates and ends with confetti and the heaviest haptic", () => {
    const beats = rewardBeats("milestone")
    expect(beats.filter((b) => b.haptic).map((b) => b.haptic)).toEqual(["light", "rise", "rise", "milestone"])
    expect(beats.at(-1)).toMatchObject({ haptic: "milestone", visual: "confetti" })
    expect([...beats].sort((a, b) => a.at - b.at)).toEqual(beats)
  })

  it("reduced motion keeps short, static visuals and drops haptics and confetti", () => {
    for (const kind of ["cook", "milestone"] as const) {
      const beats = rewardBeats(kind, true)
      expect(beats.length).toBeGreaterThan(0)
      expect(beats.every((b) => b.haptic === undefined && b.visual !== "confetti")).toBe(true)
      expect(Math.max(...beats.map((b) => b.at))).toBeLessThan(100)
    }
  })

  it("does not hand out the shared timeline", () => {
    rewardBeats("cook")[0].at = 999
    expect(rewardBeats("cook")[0].at).toBe(0)
  })

  it("milestones last longer than cooks", () => {
    expect(rewardDuration("milestone")).toBeGreaterThan(rewardDuration("cook"))
  })
})

describe("scheduleReward", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("fires each beat at its time", () => {
    const seen: number[] = []
    scheduleReward(rewardBeats("cook"), (b) => seen.push(b.at))
    vi.advanceTimersByTime(130)
    expect(seen).toEqual([0, 120])
    vi.advanceTimersByTime(400)
    expect(seen).toEqual([0, 120, 260, 420])
  })

  it("cancelling mid-play (unmount) drops the remaining beats", () => {
    const seen: RewardBeat[] = []
    const cancel = scheduleReward(rewardBeats("cook"), (b) => seen.push(b))
    vi.advanceTimersByTime(130)
    cancel()
    vi.advanceTimersByTime(1000)
    expect(seen).toHaveLength(2)
  })

  it("playing twice: cancelling the first leaves only the second sequence", () => {
    const first: number[] = []
    const second: number[] = []
    const cancelFirst = scheduleReward(rewardBeats("cook"), (b) => first.push(b.at))
    vi.advanceTimersByTime(130)
    cancelFirst()
    scheduleReward(rewardBeats("cook"), (b) => second.push(b.at))
    vi.advanceTimersByTime(1000)
    expect(first).toEqual([0, 120])
    expect(second).toEqual([0, 120, 260, 420])
  })
})
