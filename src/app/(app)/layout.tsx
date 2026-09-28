import { AppHeader } from "@/components/app-shell/app-header"
import { BottomNav } from "@/components/app-shell/bottom-nav"
import { HouseholdChannelProvider } from "@/features/household/components/household-channel"
import { requireHousehold } from "@/features/household/queries"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { household, profile } = await requireHousehold()

  return (
    <HouseholdChannelProvider householdId={household.id}>
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
      </div>
    </HouseholdChannelProvider>
  )
}
