import { AppHeader } from "@/components/app-shell/app-header"
import { BottomNav } from "@/components/app-shell/bottom-nav"
import { HousemateCookBanner } from "@/features/habit/components/housemate-cook-banner"
import { HouseholdChannelProvider } from "@/features/household/components/household-channel"
import { getHouseholdMembers, requireHousehold } from "@/features/household/queries"
import { FirstRunSync } from "@/features/preferences/components/first-run-sync"
import { ProProvider } from "@/features/pro/components/pro-provider"
import { getProStatus } from "@/features/pro/queries"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household, profile, viewer } = await requireHousehold()
  const [pro, members] = await Promise.all([getProStatus(household.id), getHouseholdMembers(household.id)])

  return (
    <HouseholdChannelProvider householdId={household.id}>
      <ProProvider status={pro} userId={viewer.id}>
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          <AppHeader
            householdName={household.name}
            displayName={profile?.display_name ?? "You"}
            avatarUrl={profile?.avatar_url ?? null}
          />
          <main className="flex flex-1 flex-col gap-6 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <BottomNav />
          <FirstRunSync hasHousehold />
          <HousemateCookBanner
            viewerId={viewer.id}
            members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
          />
        </div>
      </ProProvider>
    </HouseholdChannelProvider>
  )
}
