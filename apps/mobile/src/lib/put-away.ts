// Pure helpers for the put away sheet.

export function putAwayTitle(lineCount: number): string {
  if (lineCount === 0) return 'Put away';
  return lineCount === 1 ? 'Put away 1 item' : `Put away ${lineCount} items`;
}

/** The primary button: put the drafts away, or just clear when none are left. */
export function putAwayButtonLabel(draftCount: number, lineCount: number): string {
  if (draftCount === 0) return `Clear ${lineCount} from the list`;
  return draftCount === 1 ? 'Put away 1 item' : `Put away ${draftCount} items`;
}

/** How many checked lines won't reach the pantry because their cards were removed. */
export function skippedCount(lineCount: number, draftCount: number): number {
  return Math.max(0, lineCount - draftCount);
}

/** The toast text after a successful put away. `additions` is describeAdditions() text. */
export function putAwayToast(draftCount: number, cleared: number, additions: string, skipped: number): string {
  if (draftCount === 0) return `Cleared ${cleared} from the list`;
  const parts = [draftCount === 1 ? 'Put away 1 item' : `Put away ${draftCount} items`, additions];
  if (skipped > 0) parts.push(`${skipped} cleared without adding`);
  return parts.join('. ');
}
