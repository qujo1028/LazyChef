// W3 (feature/p2-review) owns this file. Stub from the lead's step 0.
import type { ReviewDraft } from '@lazychef/core/pantry/review';
import { Text } from 'react-native';

/**
 * "Check it before adding": one card per draft (name, amount and unit, category with the
 * "we'll remember" hint, expiry, always-on-hand switch, remove). Same rules as the web
 * app's src/features/pantry/components/review-list.tsx. Removing the last card calls
 * onChange([]); the parent then goes back to typing.
 */
export function ReviewList({
  drafts,
}: {
  drafts: readonly ReviewDraft[];
  onChange: (drafts: ReviewDraft[]) => void;
  today: string;
  /** Show field errors (after a failed Add). */
  showErrors: boolean;
  disabled?: boolean;
}) {
  return <Text>{drafts.length} items (W3 builds the review cards).</Text>;
}
