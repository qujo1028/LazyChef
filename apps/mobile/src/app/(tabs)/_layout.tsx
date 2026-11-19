import { useRouter } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { View } from "react-native";

import { AppScreenHeader } from "@/components/AppScreenHeader";
import { BottomTabBar } from "@/components/BottomTabBar";
import { CircleIconButton } from "@/components/CircleIconButton";
import { IdeasButton } from "@/features/ideas/components/IdeasButton";
import { ListProvider } from '@/features/list/list-provider';
import { PantryProvider } from "@/features/pantry/pantry-provider";
import { useActiveHousehold } from "@/lib/household";
import { HouseholdChannelProvider } from "@/providers/household-channel";

// Open on Home; the tab order below puts it in the middle.
export const unstable_settings = { initialRouteName: "home" };

export default function TabsLayout() {
  const router = useRouter();
  const { household } = useActiveHousehold();
  // The root gate only shows this group with a household, so this is a brief edge case.
  const name = household?.name ?? "LazyChef";
  const activity = (
    <CircleIconButton icon="pulse-outline" label="Activity" onPress={() => router.push("/activity")} />
  );

  return (
    <HouseholdChannelProvider householdId={household?.id ?? null}>
      <PantryProvider householdId={household?.id ?? null}>
        <ListProvider householdId={household?.id ?? null}>
          <Tabs
            tabBar={(props) => <BottomTabBar {...props} />}
            screenOptions={{
              header: () => <AppScreenHeader title={name} right={activity} />,
            }}
          >
            <Tabs.Screen name="pantry" options={{ title: "Pantry" }} />
            <Tabs.Screen
              name="recipes"
              options={{
                title: "Recipes",
                // The single Ideas entry point for AI (docs/product-scope.md) sits next to Activity.
                header: () => (
                  <AppScreenHeader
                    title={name}
                    right={
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <IdeasButton />
                        {activity}
                      </View>
                    }
                  />
                ),
              }}
            />
            <Tabs.Screen name="home" options={{ title: "Home" }} />
            <Tabs.Screen name="list" options={{ title: "List" }} />
            <Tabs.Screen name="household" options={{ title: "Household" }} />
          </Tabs>
        </ListProvider>
      </PantryProvider>
    </HouseholdChannelProvider>
  );
}
