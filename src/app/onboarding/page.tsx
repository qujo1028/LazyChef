import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, House, UserPlus } from "lucide-react"

import { CenteredShell } from "@/components/centered-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignOutButton } from "@/features/auth/components/sign-out-button"
import { dismissPendingInvite } from "@/features/household/actions"
import { CreateHouseholdForm, JoinHouseholdForm } from "@/features/household/components/household-forms"
import { getHouseholdContext, getPendingInvite } from "@/features/household/queries"

export const metadata: Metadata = { title: "Set up your household" }

export default async function OnboardingPage() {
  const [{ profile, memberships }, invite] = await Promise.all([getHouseholdContext(), getPendingInvite()])
  const firstName = profile?.display_name.split(" ")[0]
  const hasHousehold = memberships.length > 0

  return (
    <CenteredShell aside={<SignOutButton compact />}>
      {hasHousehold ? (
        <Button asChild variant="ghost" size="sm" className="-ml-2 justify-self-start self-start">
          <Link href="/pantry">
            <ArrowLeft />
            Back to your pantry
          </Link>
        </Button>
      ) : null}

      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {hasHousehold ? "Add another household" : `Welcome${firstName ? `, ${firstName}` : ""}!`}
        </h1>
        <p className="text-muted-foreground">
          A household shares one pantry and one shopping list. Start one, or join the one your housemates made.
        </p>
      </div>

      {invite ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>You&apos;re invited to {invite.household_name}</CardTitle>
            <CardDescription>
              {invite.member_count} {invite.member_count === 1 ? "person is" : "people are"} already sharing a pantry there.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <JoinHouseholdForm defaultCode={invite.code} />
            <form action={dismissPendingInvite}>
              <Button type="submit" variant="ghost" size="sm" className="w-full text-muted-foreground">
                Not now
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <House className="size-5 text-primary" aria-hidden />
            Start a household
          </CardTitle>
          <CardDescription>You&apos;ll get an invite link to send your housemates.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateHouseholdForm />
        </CardContent>
      </Card>

      {invite ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" aria-hidden />
              Join a household
            </CardTitle>
            <CardDescription>Got an invite code from a housemate? Enter it here.</CardDescription>
          </CardHeader>
          <CardContent>
            <JoinHouseholdForm />
          </CardContent>
        </Card>
      )}
    </CenteredShell>
  )
}
