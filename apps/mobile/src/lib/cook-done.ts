// Pure: the words on the cook sheet (the confirm button and the done view).
import { DEFAULT_GOAL } from '@lazychef/core/habit/constants';
import type { HabitResult } from '@lazychef/core/habit/summary';
import { TIER_LABELS } from '@lazychef/core/habit/tiers';
import { displayName } from '@lazychef/core/pantry/display';
import { undoAmounts, type CookResult } from '@lazychef/core/recipes/cook';
import { formatQuantity } from '@lazychef/core/units';

function items(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** The confirm button: how many pantry items come out. */
export function confirmLabel(deductCount: number): string {
  return deductCount === 0 ? 'Nothing to take out' : `Take ${items(deductCount)} out`;
}

export function doneTitle(title: string): string {
  return `Nice! You cooked ${title}`;
}

/** "Took 3 items out of the pantry." for the toast and the done view. */
export function tookOutSummary(results: readonly CookResult[]): string {
  const count = undoAmounts(results).length;
  return count === 0 ? 'Nothing came out of the pantry.' : `Took ${items(count)} out of the pantry.`;
}

/** One line per item that actually came out: "Milk, 1 cup". */
export function tookOutLines(results: readonly CookResult[]): string[] {
  const taken = new Map<string, { name: string; unit: string; amount: number }>();
  for (const row of results) {
    if (row.quantity_before === null || row.quantity_after === null) continue;
    const amount = Number(row.quantity_before) - Number(row.quantity_after);
    if (!(amount > 0)) continue;
    const seen = taken.get(row.item_id);
    taken.set(row.item_id, { name: row.name, unit: row.unit, amount: (seen?.amount ?? 0) + amount });
  }
  return [...taken.values()].map((row) => {
    const amount = formatQuantity(row.amount, row.unit);
    return amount ? `${displayName(row.name)}, ${amount}` : displayName(row.name);
  });
}

const CHALLENGE_NAMES: Record<string, string> = { streak3: 'Cook 3 days in a row', try_new: 'Try something new' };

/** The celebration line when a cook earned something, else null. */
export function milestoneLine(habit: HabitResult | null): string | null {
  const milestone = habit?.milestone;
  if (!milestone) return null;
  if (milestone.kind === 'tier') return `${TIER_LABELS[milestone.tier]} this week!`;
  if (milestone.kind === 'streak') return `${milestone.days} day streak!`;
  return `Challenge done: ${CHALLENGE_NAMES[milestone.challenge] ?? 'nice work'}`;
}

/** "3 of 3 this week" and "4 day streak" (the streak only once it is 2 or more). */
export function habitLines(habit: HabitResult | null, goal: number = DEFAULT_GOAL): string[] {
  if (!habit) return [];
  const lines = [habit.cooksThisWeek > goal ? `${habit.cooksThisWeek} nights this week` : `${habit.cooksThisWeek} of ${goal} this week`];
  if (habit.streakAfter >= 2) lines.push(`${habit.streakAfter} day streak`);
  return lines;
}

/** Toast after "Add to list". */
export function addedToListMessage(names: readonly string[]): string {
  if (names.length === 1) return `Added ${displayName(names[0])} to the shopping list`;
  return `Added ${names.length} items to the shopping list`;
}
