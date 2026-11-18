// Pure: what the reward plays. The shared timeline (packages/core/src/habit/reward.ts) already
// drops the buzzes and the confetti under reduce motion; we keep one haptic so the cook still
// feels like something happened (reduce motion is about movement, not touch).
import { rewardBeats, type RewardBeat, type RewardKind } from '@lazychef/core/habit/reward';

export function rewardPlan(kind: RewardKind, reduceMotion: boolean): RewardBeat[] {
  const beats = rewardBeats(kind, reduceMotion);
  if (!reduceMotion) return beats;
  return [{ at: 0, haptic: kind === 'milestone' ? 'milestone' : 'success' }, ...beats];
}
