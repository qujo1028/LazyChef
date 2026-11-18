"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { haptic, prefersReducedMotion } from "@/lib/native/haptics"

import { rewardBeats, scheduleReward, type RewardKind } from "./reward"

export type RewardState = {
  /** Bumps on every play, so a replay restarts the animation. */
  run: number
  kind: RewardKind | null
  ring: boolean
  flame: boolean
  confetti: boolean
  reducedMotion: boolean
}

const IDLE: RewardState = { run: 0, kind: null, ring: false, flame: false, confetti: false, reducedMotion: false }

/**
 * `play(kind)` runs the reward timeline: each beat fires its haptic and flips its visual flag from
 * the same timer, so they never drift. Playing again restarts; unmounting cancels what is left.
 */
export function useReward() {
  const [state, setState] = useState<RewardState>(IDLE)
  const cancel = useRef<(() => void) | null>(null)

  const play = useCallback((kind: RewardKind) => {
    cancel.current?.()
    const reducedMotion = prefersReducedMotion()
    setState((current) => ({ ...IDLE, run: current.run + 1, kind, reducedMotion }))
    cancel.current = scheduleReward(rewardBeats(kind, reducedMotion), (beat) => {
      if (beat.haptic) haptic(beat.haptic)
      const visual = beat.visual
      if (visual) setState((current) => ({ ...current, [visual]: true }))
    })
  }, [])

  useEffect(
    () => () => {
      cancel.current?.()
    },
    [],
  )

  return { play, state }
}
