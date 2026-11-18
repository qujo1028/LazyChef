/** The live line under the "Add several" box: the item count, or how to write the list. */
export function addSeveralHint(count: number): string {
  if (count <= 0) return 'One item per line, or separate with commas.';
  return `${count} ${count === 1 ? 'item' : 'items'}. Amounts are optional.`;
}
