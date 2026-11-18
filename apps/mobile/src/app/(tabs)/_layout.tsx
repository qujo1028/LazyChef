import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { AppScreenHeader } from '@/components/AppScreenHeader';
import { BottomTabBar } from '@/components/BottomTabBar';
import { CircleIconButton } from '@/components/CircleIconButton';

// P1 wires the real household name here.
const HOUSEHOLD_NAME = 'Your household';

export default function TabsLayout() {
  const router = useRouter();
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        header: () => (
          <AppScreenHeader
            title={HOUSEHOLD_NAME}
            right={<CircleIconButton icon="pulse-outline" label="Activity" onPress={() => router.push('/activity')} />}
          />
        ),
      }}
    >
      <Tabs.Screen name="pantry" options={{ title: 'Pantry' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes' }} />
      <Tabs.Screen name="list" options={{ title: 'List' }} />
      <Tabs.Screen name="household" options={{ title: 'Household' }} />
    </Tabs>
  );
}
