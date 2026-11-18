// The reward timeline, pure. Haptics and visuals share ONE clock: scheduleReward() fires each beat
// from a single place, so the buzz and the animation step together and cannot drift.
import type { HapticKind } from "@/lib/native/haptics"

export type RewardKind = "cook" | "milestone"
export type RewardVisual = "ring" | "flame" | "confetti"

export type RewardBeat = { at: number; haptic?: HapticKind; visual?: RewardVisual }

const TIMELINES: Record<RewardKind, RewardBeat[]> = {
  cook: [
    { at: 0, haptic: "light" },
    { at: 120, haptic: "light" },
    { at: 260, haptic: "rise", visual: "ring" },
    { at: 420, haptic: "success", visual: "flame" },
  ],
  milestone: [
    { at: 0, haptic: "light", visual: "ring" },
    { at: 140, haptic: "rise", visual: "flame" },
    { at: 300, haptic: "rise" },
    { at: 480, haptic: "milestone", visual: "confetti" },
  ],
}

/** Under reduced motion there is nothing to time: short static visuals, no haptics, no confetti. */
export function rewardBeats(kind: RewardKind, reducedMotion = false): RewardBeat[] {
  const beats = TIMELINES[kind]
  if (!reducedMotion) return beats.map((beat) => ({ ...beat }))
  const visuals = [...new Set(beats.flatMap((beat) => (beat.visual && beat.visual !== "confetti" ? [beat.visual] : [])))]
  return visuals.map((visual, i) => ({ at: i * 40, visual }))
}

/** How long the whole thing lasts, for cleanup. */
export function rewardDuration(kind: RewardKind): number {
  return Math.max(...TIMELINES[kind].map((beat) => beat.at)) + (kind === "milestone" ? 1600 : 900)
}

export type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** Schedules every beat; returns a cancel function that drops the ones not yet fired. */
export function scheduleReward(
  beats: readonly RewardBeat[],
  onBeat: (beat: RewardBeat) => void,
  scheduler: Scheduler = realScheduler,
): () => void {
  let cancelled = false
  const handles = beats.map((beat) =>
    scheduler.setTimeout(() => {
      if (!cancelled) onBeat(beat)
    }, beat.at),
  )
  return () => {
    cancelled = true
    for (const handle of handles) scheduler.clearTimeout(handle)
  }
}
