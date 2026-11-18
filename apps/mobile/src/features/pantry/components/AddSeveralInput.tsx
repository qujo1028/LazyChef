// W3 (feature/p2-review) owns this file. Stub from the lead's step 0.
import { TextInput } from 'react-native';

/**
 * "Add several": a multi-line box for a whole shop ("2 lbs chicken, 6 eggs" or one per
 * line), with a live "N items" hint. Pasted lists keep their line breaks (insertPastedLines).
 */
export function AddSeveralInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return <TextInput multiline value={value} onChangeText={onChange} accessibilityLabel="What did you get?" />;
}
