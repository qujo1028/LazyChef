import { DEFAULT_GOAL } from '@lazychef/core/habit/constants';
import type { HabitSummary } from '@lazychef/core/habit/summary';
import { nextTier, tierFor, TIER_LABELS } from '@lazychef/core/habit/tiers';
import { weekDayKeys } from '@lazychef/core/habit/week';

/** The ring's accessible label, e.g. "2 of 3 cook days this week". */
export function ringLabel(cooks: number, goal: number): string {
  return `${cooks} of ${goal} cook days this week`;
}

/** How full the ring is, 0 to 1. */
export function ringFill(cooks: number, goal: number): number {
  return Math.min(1, Math.max(0, cooks) / Math.max(1, goal));
}

/** "4 day streak", or null when there is nothing to show (no streak, or a comeback). */
export function streakLine(summary: Pick<HabitSummary, 'streak' | 'comeback'>): string | null {
  const { count, atRisk } = summary.streak;
  if (count <= 0 || summary.comeback) return null;
  return `${count} day streak${atRisk ? ', cook today to keep it' : ''}`;
}

/** "Silver this week", or null below Bronze. */
export function tierLine(cooks: number): string | null {
  const tier = tierFor(cooks);
  return tier ? `${TIER_LABELS[tier]} this week` : null;
}

/** "1 more night for Silver", or null at Gold. */
export function nextTierHint(cooks: number): string | null {
  const next = nextTier(cooks);
  if (!next) return null;
  const left = next.at - cooks;
  return `${left} more ${left === 1 ? 'night' : 'nights'} for ${TIER_LABELS[next.tier]}`;
}

/** The card's headline and the line under it. */
export function weekHeadline(
  summary: Pick<HabitSummary, 'cooksThisWeek' | 'comeback'>,
  goal: number,
  neverCooked: boolean,
): { headline: string; sub: string } {
  const cooks = summary.cooksThisWeek;
  if (neverCooked) return { headline: 'Start your week', sub: `Cook ${goal} nights this week and see the ring fill.` };
  if (summary.comeback) return { headline: 'Welcome back', sub: `Aim for ${goal} nights this week.` };
  if (cooks >= goal) return { headline: 'Goal reached', sub: nextTierHint(cooks) ?? 'A full week. Nice.' };
  const left = goal - cooks;
  return { headline: 'This week', sub: `${left} more ${left === 1 ? 'night' : 'nights'} to hit your goal.` };
}

/** Accessible text for one of the seven day dots. */
export function dayDotLabel(letter: string, cooked: boolean, isToday: boolean): string {
  return `${letter}: ${cooked ? 'cooked' : isToday ? 'today, not yet' : 'no cook'}`;
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

// Dismissed nudges, one day at a time (stored as JSON in AsyncStorage).
export function parseDismissed(raw: string | null, today: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw || 'null');
    if (parsed && typeof parsed === 'object' && 'day' in parsed && 'keys' in parsed) {
      const { day, keys } = parsed as { day: unknown; keys: unknown };
      if (day === today && Array.isArray(keys)) return new Set(keys.filter((k): k is string => typeof k === 'string'));
    }
  } catch {
    // Corrupt: nothing is dismissed.
  }
  return new Set();
}

export function serializeDismissed(today: string, keys: ReadonlySet<string>): string {
  return JSON.stringify({ day: today, keys: [...keys] });
}

// Dev only: preview card states without waiting days. Never touches the database.
export type DevPreset =
  | { kind: 'cookDays'; n: number }
  | { kind: 'streak'; n: number }
  | { kind: 'comeback' }
  | { kind: 'challengeDone' };

export const DEV_PRESETS: { label: string; preset: DevPreset }[] = [
  { label: '0 days', preset: { kind: 'cookDays', n: 0 } },
  { label: '2 days', preset: { kind: 'cookDays', n: 2 } },
  { label: '3 days', preset: { kind: 'cookDays', n: DEFAULT_GOAL } },
  { label: '4 days', preset: { kind: 'cookDays', n: 4 } },
  { label: '6 days', preset: { kind: 'cookDays', n: 6 } },
  { label: 'Streak 4', preset: { kind: 'streak', n: 4 } },
  { label: 'Comeback', preset: { kind: 'comeback' } },
  { label: 'Challenge done', preset: { kind: 'challengeDone' } },
];

/** A copy of the summary with the preset applied, for display only. */
export function applyDevPreset(summary: HabitSummary, preset: DevPreset): HabitSummary {
  switch (preset.kind) {
    case 'cookDays': {
      const n = Math.max(0, Math.min(7, preset.n));
      const days = new Set(weekDayKeys(summary.today).slice(0, n));
      return { ...summary, days, cooksThisWeek: n, tier: tierFor(n), comeback: false };
    }
    case 'streak':
      return { ...summary, streak: { count: Math.max(0, preset.n), forgave: false, atRisk: false }, comeback: false };
    case 'comeback':
      return {
        ...summary,
        days: new Set<string>(),
        cooksThisWeek: 0,
        tier: null,
        streak: { count: 0, forgave: false, atRisk: false },
        daysSinceLastCook: 5,
        comeback: true,
      };
    case 'challengeDone':
      return { ...summary, challenge: null };
  }
}
