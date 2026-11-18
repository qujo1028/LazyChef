// Plain-language lines about Spoonacular's daily quota and why new ideas might be missing.
// Pure, so Vitest can run it.
import type { EdgeFailure, RecipeQuota } from '@lazychef/core/recipes/edge-contract';

/** A new search costs about this many points (findByIngredients for 40 recipes is 1.4). */
export const POINTS_PER_SEARCH = 1.4;

/** Whole searches left for a number of points, never below zero. */
export function searchesLeft(pointsLeft: number): number {
  return Math.max(0, Math.floor(pointsLeft / POINTS_PER_SEARCH));
}

/** "5 pm", "5:30 pm", "midnight" in the device's time zone. */
export function resetTimeLabel(resetsAt: string): string | null {
  const when = new Date(resetsAt);
  if (Number.isNaN(when.getTime())) return null;
  const hours = when.getHours();
  const minutes = when.getMinutes();
  if (hours === 0 && minutes === 0) return 'midnight';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? 'am' : 'pm';
  return minutes === 0 ? `${hour} ${suffix}` : `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export type QuotaNotice = { tone: 'info' | 'note'; text: string };

/**
 * The one line under the search box. `info` is a plain count, `note` explains why new ideas
 * are not showing. Local recipes always still show. Null when there is nothing to say.
 */
export function quotaNotice(input: {
  offline: boolean;
  quota: RecipeQuota | null;
  failure: Pick<EdgeFailure, 'code'> | null;
}): QuotaNotice | null {
  const { offline, quota, failure } = input;
  if (offline) return { tone: 'note', text: "You're offline. Showing recipes from your library." };
  const reset = quota ? resetTimeLabel(quota.resetsAt) : null;
  if (failure?.code === 'not_configured') {
    return { tone: 'note', text: "New ideas aren't set up yet. Showing recipes from your library." };
  }
  if (failure?.code === 'resting' || quota?.resting) {
    return {
      tone: 'note',
      text: `New ideas are resting${reset ? ` until ${reset}` : ' for now'}. Showing recipes from your library.`,
    };
  }
  if (failure?.code === 'rate_limited') {
    return { tone: 'note', text: 'Too many searches for now. Showing recipes from your library.' };
  }
  if (failure) return { tone: 'note', text: "Couldn't reach new ideas. Showing recipes from your library." };
  if (quota && quota.pointsLeft !== null) {
    const left = searchesLeft(quota.pointsLeft);
    return {
      tone: 'info',
      text: `Spoonacular: ${left} ${left === 1 ? 'search' : 'searches'} left today${reset ? `, resets at ${reset}` : ''}`,
    };
  }
  return null;
}
