// W1 (feature/p2-pantry-screen) owns this file. Stub from the lead's step 0.
import { groupPantry } from '@lazychef/core/pantry/group';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Screen } from '@/components/Screen';
import { AddFoodSheet, type AddFoodSeed } from '@/features/pantry/components/AddFoodSheet';
import { EditItemSheet } from '@/features/pantry/components/EditItemSheet';
import { usePantry } from '@/features/pantry/pantry-provider';
import { useToday } from '@/lib/use-today';

export default function PantryScreen() {
  const { items } = usePantry();
  const today = useToday();
  const sections = useMemo(() => groupPantry(items.values(), today), [items, today]);
  const [adding, setAdding] = useState<{ visible: boolean; seed: AddFoodSeed }>({ visible: false, seed: { text: '', n: 0 } });
  const [editing, setEditing] = useState<{ id: string | null; visible: boolean }>({ id: null, visible: false });

  return (
    <Screen>
      {sections.total === 0 ? (
        <EmptyState title="Pantry" line="Nothing here yet. Add what is in your kitchen and it will show up here." />
      ) : (
        <Text>{sections.total} items (W1 builds the list).</Text>
      )}
      <PrimaryPillButton title="Add food" onPress={() => setAdding((a) => ({ ...a, visible: true }))} />
      <AddFoodSheet visible={adding.visible} seed={adding.seed} onClose={() => setAdding((a) => ({ ...a, visible: false }))} />
      <EditItemSheet itemId={editing.id} visible={editing.visible} onClose={() => setEditing((e) => ({ ...e, visible: false }))} />
    </Screen>
  );
}
