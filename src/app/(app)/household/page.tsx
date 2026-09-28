import type { Metadata } from "next"
import Link from "next/link"
import { PartyPopper, Plus } from "lucide-react"

import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignOutButton } from "@/features/auth/components/sign-out-button"
import { HouseholdSwitcher, LeaveHouseholdButton } from "@/features/household/components/household-actions"
import { DisplayNameForm, RenameHouseholdForm } from "@/features/household/components/household-forms"
import { InviteCard } from "@/features/household/components/invite-card"
import { MemberList } from "@/features/household/components/member-list"
import { getHouseholdMembers, requireHousehold } from "@/features/household/queries"
import { firstParam } from "@/lib/search-params"

export const metadata: Metadata = { title: "Household" }

export default async function HouseholdPage({ searchParams }: PageProps<"/household">) {
  const [{ viewer, profile, household, role, memberships }, params] = await Promise.all([
    requireHousehold(),
    searchParams,
  ])
  const members = await getHouseholdMembers(household.id)
  const isOwner = role === "owner"
  const welcome = firstParam(params.welcome) === "1"

  return (
    <>
      <PageHeading title={household.name} description={`${members.length} ${members.length === 1 ? "member" : "members"}`} />

      {welcome && members.length === 1 ? (
        <div className="flex gap-3 rounded-xl bg-primary/10 p-4 text-sm">
          <PartyPopper className="size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">Your household is ready.</span> Send your housemates the invite link so you
            all share one pantry and shopping list.
          </p>
        </div>
      ) : null}

      <InviteCard householdId={household.id} householdName={household.name} inviteCode={household.inviteCode} isOwner={isOwner} />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Changes anyone makes show up for everyone right away.</CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList householdId={household.id} members={members} viewerId={viewer.id} viewerIsOwner={isOwner} />
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <RenameHouseholdForm householdId={household.id} name={household.name} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your households</CardTitle>
          <CardDescription>Belong to more than one? Switch between them here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {memberships.length > 1 ? (
            <HouseholdSwitcher
              activeId={household.id}
              households={memberships.map((m) => ({ id: m.household.id, name: m.household.name }))}
            />
          ) : null}
          <Button asChild variant="outline">
            <Link href="/onboarding">
              <Plus />
              Create or join another household
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>You</CardTitle>
          {viewer.email ? <CardDescription>Signed in as {viewer.email}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          <DisplayNameForm displayName={profile?.display_name ?? ""} />
          <SignOutButton />
        </CardContent>
      </Card>

      <LeaveHouseholdButton householdId={household.id} householdName={household.name} lastMember={members.length === 1} />
    </>
  )
}
