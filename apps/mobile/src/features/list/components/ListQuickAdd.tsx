import { describeListAdditions } from '@lazychef/core/list/plan';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { useToast } from '@/components/Toast';
import { friendlyError } from '@/lib/household-settings';
import { useTheme } from '@/theme';

import { addListText } from '../api';

/** One input at the top of the list: type "2 lemons, milk" and add. Keeps the text if it fails. */
export function ListQuickAdd({ householdId }: { householdId: string | null }) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submit = async () => {
    const value = text.trim();
    if (inFlight.current) return;
    if (!value) {
      setError('Type something to add, like "2 lemons".');
      return;
    }
    if (!householdId) {
      setError('Your household is still loading. Try again in a moment.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await addListText(householdId, value);
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      setText('');
      toast.show({ id: 'list-add', message: describeListAdditions(result) });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          minHeight: minTouch,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.outline,
          backgroundColor: colors.surface,
          paddingLeft: spacing.md,
        }}
      >
        <TextInput
          accessibilityLabel="Add to the list"
          placeholder="Add to the list, like 2 lemons"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          submitBehavior="submit"
          style={[type.body, { flex: 1, color: colors.ink, paddingVertical: 10 }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add"
          accessibilityState={{ disabled: busy }}
          onPress={() => void submit()}
          disabled={busy}
          style={{ minWidth: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[type.button, { color: colors.primary }]}>Add</Text>
          )}
        </Pressable>
      </View>
      {error ? <FormMessage tone="error" text={error} /> : null}
    </View>
  );
}
