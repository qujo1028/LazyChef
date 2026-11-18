import { CATEGORY_META } from '@lazychef/core/ingredients/types';
import { amountText } from '@lazychef/core/list/display';
import type { ListSections } from '@lazychef/core/list/group';
import type { ListItem } from '@lazychef/core/list/types';

export type ListRow =
  | { kind: 'heading'; key: string; title: string; emoji: string | null; count: number; first: boolean }
  | { kind: 'item'; key: string; item: ListItem; inCart: boolean; first: boolean; last: boolean }
  | { kind: 'putAway'; key: string; count: number };

/**
 * Flattens the grouped list into rows for a FlatList: a heading per store category with its
 * lines, then an "In the cart" heading with the checked lines and the "Put away" button.
 * Lines are marked first and last so the list can round each card's corners.
 */
export function buildListRows(sections: ListSections): ListRow[] {
  const rows: ListRow[] = [];
  const addItems = (prefix: string, items: ListItem[], inCart: boolean) => {
    items.forEach((item, i) =>
      rows.push({ kind: 'item', key: `${prefix}:${item.id}`, item, inCart, first: i === 0, last: i === items.length - 1 }),
    );
  };
  for (const { category, items } of sections.toBuy) {
    const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
    rows.push({ kind: 'heading', key: `h:${category}`, title: meta.label, emoji: meta.emoji, count: items.length, first: rows.length === 0 });
    addItems(category, items, false);
  }
  if (sections.inCart.length > 0) {
    rows.push({ kind: 'heading', key: 'h:cart', title: 'In the cart', emoji: '🛒', count: sections.inCart.length, first: rows.length === 0 });
    addItems('cart', sections.inCart, true);
    rows.push({ kind: 'putAway', key: 'putAway', count: sections.inCart.length });
  }
  return rows;
}

/** The small line under a name: amount, note, "For <recipe>" and (in the cart) who checked it. */
export function listMeta(item: ListItem, detail?: string): string {
  return [amountText(item), item.note?.trim(), item.recipe_title ? `For ${item.recipe_title}` : null, detail]
    .filter(Boolean)
    .join(' · ');
}

/** "Put away 1 item" or "Put away 3 items". */
export function putAwayLabel(count: number): string {
  return `Put away ${count} ${count === 1 ? 'item' : 'items'}`;
}
