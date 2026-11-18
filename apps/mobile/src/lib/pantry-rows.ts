import { CATEGORY_META } from '@lazychef/core/ingredients/types';
import type { PantrySections } from '@lazychef/core/pantry/group';
import type { PantryItem } from '@lazychef/core/pantry/types';

export type PantryRow =
  | { kind: 'heading'; key: string; title: string; emoji: string | null; count: number; first: boolean }
  | { kind: 'item'; key: string; item: PantryItem; showEmoji: boolean; muted: boolean; first: boolean; last: boolean }
  | { kind: 'staples'; key: string; items: PantryItem[] }
  | { kind: 'ranOut'; key: string; count: number; expanded: boolean };

/**
 * Flattens the grouped pantry into one list of rows for a FlatList: each section is a heading,
 * then its rows (marked first and last so the list can round the card's corners). "Ran out"
 * is a toggle row, and its items only appear when it is open (always, while searching).
 */
export function buildPantryRows(sections: PantrySections, options: { ranOutOpen: boolean; searching: boolean }): PantryRow[] {
  const rows: PantryRow[] = [];
  const addItems = (prefix: string, items: PantryItem[], showEmoji: boolean, muted: boolean) => {
    items.forEach((item, i) =>
      rows.push({
        kind: 'item',
        key: `${prefix}:${item.id}`,
        item,
        showEmoji,
        muted,
        first: i === 0,
        last: i === items.length - 1,
      }),
    );
  };
  const heading = (key: string, title: string, emoji: string | null, count: number) =>
    rows.push({ kind: 'heading', key: `h:${key}`, title, emoji, count, first: rows.length === 0 });

  if (sections.expiring.length > 0) {
    heading('expiring', 'Expiring soon', '⏰', sections.expiring.length);
    addItems('expiring', sections.expiring, true, false);
  }
  for (const { category, items } of sections.categories) {
    heading(category, CATEGORY_META[category].label, CATEGORY_META[category].emoji, items.length);
    addItems(category, items, false, false);
  }
  if (sections.staples.length > 0) {
    heading('staples', 'Always on hand', '♾️', sections.staples.length);
    rows.push({ kind: 'staples', key: 'staples', items: sections.staples });
  }
  if (sections.ranOut.length > 0) {
    const expanded = options.ranOutOpen || options.searching;
    rows.push({ kind: 'ranOut', key: 'ranOut', count: sections.ranOut.length, expanded });
    if (expanded) addItems('ranOut', sections.ranOut, true, true);
  }
  return rows;
}

/** What Undo gives back after "-1": the database stops at 0, so 0.5 of 0.5 returns 0.5, not 1. */
export function amountTaken(quantity: number | null): number {
  return Math.min(1, Math.max(0, quantity ?? 0));
}
