import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { AppScreenHeader } from '@/components/AppScreenHeader';
import { BottomTabBar } from '@/components/BottomTabBar';
import { CircleIconButton } from '@/components/CircleIconButton';
import { useActiveHousehold } from '@/lib/household';
import { HouseholdChannelProvider } from '@/providers/household-channel';

export default function TabsLayout() {
  const router = useRouter();
  const { household } = useActiveHousehold();
  // The root gate only shows this group with a household, so this is a brief edge case.
  const name = household?.name ?? 'LazyChef';

  return (
    <HouseholdChannelProvider householdId={household?.id ?? null}>
      <Tabs
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={{
          header: () => (
            <AppScreenHeader
              title={name}
              right={
                <CircleIconButton
                  icon='pulse-outline'
                  label='Activity'
                  onPress={() => router.push('/activity')}
                />
              }
            />
          ),
        }}
      >
        <Tabs.Screen name='pantry' options={{ title: 'Pantry' }} />
        <Tabs.Screen name='recipes' options={{ title: 'Recipes' }} />
        <Tabs.Screen name='list' options={{ title: 'List' }} />
        <Tabs.Screen name='household' options={{ title: 'Household' }} />
      </Tabs>
    </HouseholdChannelProvider>
  );
}
