// W1 (feature/p3-list-screen) owns this file. Stub from the lead's step 0.
import { groupList, listSummary } from '@lazychef/core/list/group';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Screen } from '@/components/Screen';
import { ListEditSheet } from '@/features/list/components/ListEditSheet';
import { PutAwaySheet } from '@/features/list/components/PutAwaySheet';
import { useList } from '@/features/list/list-provider';

export default function ListScreen() {
  const { items } = useList();
  const sections = useMemo(() => groupList(items.values()), [items]);
  const [editing, setEditing] = useState<{ id: string | null; visible: boolean }>({ id: null, visible: false });
  const [putAway, setPutAway] = useState({ visible: false, session: 0 });

  return (
    <Screen>
      {sections.toBuyCount === 0 && sections.inCart.length === 0 ? (
        <EmptyState title="List" line="Your shopping list is empty. Nice and tidy." />
      ) : (
        <Text>{listSummary(sections.toBuyCount, sections.inCart.length)} (W1 builds the list).</Text>
      )}
      {sections.inCart.length > 0 ? (
        <PrimaryPillButton title="Put away" onPress={() => setPutAway((p) => ({ visible: true, session: p.session + 1 }))} />
      ) : null}
      <ListEditSheet itemId={editing.id} visible={editing.visible} onClose={() => setEditing((e) => ({ ...e, visible: false }))} />
      <PutAwaySheet visible={putAway.visible} session={putAway.session} onClose={() => setPutAway((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
