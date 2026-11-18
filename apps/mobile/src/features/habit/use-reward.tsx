import { scheduleReward, type RewardKind } from '@lazychef/core/habit/reward';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { haptic } from '@/lib/haptics';
import { rewardPlan } from '@/lib/reward-plan';

export type RewardState = {
  /** Bumps on every play, so a replay restarts the animation. */
  run: number;
  kind: RewardKind | null;
  ring: boolean;
  flame: boolean;
  confetti: boolean;
  reduceMotion: boolean;
};

const IDLE: RewardState = { run: 0, kind: null, ring: false, flame: false, confetti: false, reduceMotion: false };

/**
 * `play(kind)` runs the reward timeline: each beat fires its haptic and flips its visual flag from
 * the same timer, so they never drift. Playing again restarts; unmounting cancels what is left.
 */
export function useReward() {
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<RewardState>(IDLE);
  const cancel = useRef<(() => void) | null>(null);

  const play = useCallback(
    (kind: RewardKind) => {
      cancel.current?.();
      setState((current) => ({ ...IDLE, run: current.run + 1, kind, reduceMotion }));
      cancel.current = scheduleReward(rewardPlan(kind, reduceMotion), (beat) => {
        if (beat.haptic) haptic(beat.haptic);
        const visual = beat.visual;
        if (visual) setState((current) => ({ ...current, [visual]: true }));
      });
    },
    [reduceMotion],
  );

  useEffect(
    () => () => {
      cancel.current?.();
    },
    [],
  );

  return { play, state };
}
