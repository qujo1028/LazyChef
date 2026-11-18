// Pure helpers for the put away sheet.

function items(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

export function putAwayTitle(lineCount: number): string {
  if (lineCount === 0) return 'Put away';
  return `Put away ${items(lineCount)}`;
}

/** The primary button: put the drafts away, or just clear when none are left. */
export function putAwayButtonLabel(draftCount: number, lineCount: number): string {
  if (draftCount === 0) return `Clear ${lineCount} from the list`;
  return `Put away ${items(draftCount)}`;
}

/** How many checked lines won't reach the pantry because their cards were removed. */
export function skippedCount(lineCount: number, draftCount: number): number {
  return Math.max(0, lineCount - draftCount);
}

/** The toast text after a successful put away. `additions` is describeAdditions() text. */
export function putAwayToast(draftCount: number, cleared: number, additions: string, skipped: number): string {
  if (draftCount === 0) return `Cleared ${cleared} from the list`;
  const parts = [`Put away ${items(draftCount)}`, additions];
  if (skipped > 0) parts.push(`${skipped} cleared without adding`);
  return parts.join('. ');
}
