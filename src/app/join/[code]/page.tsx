import type { Metadata } from "next"
import Link from "next/link"
import { Users } from "lucide-react"

import { CenteredShell } from "@/components/centered-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { JoinHouseholdForm } from "@/features/household/components/household-forms"
import { OpenHouseholdButton } from "@/features/household/components/household-actions"
import { getInvitePreview, requireViewer } from "@/features/household/queries"

export const metadata: Metadata = { title: "Join a household" }

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params
  await requireViewer()
  const invite = await getInvitePreview(code)

  if (invite === "limited") {
    return (
      <CenteredShell>
        <div className="grid gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Too many tries</h1>
          <p className="text-muted-foreground">
            That&apos;s a lot of invite codes that didn&apos;t match. Wait about 15 minutes, then try the link again.
          </p>
        </div>
      </CenteredShell>
    )
  }

  if (!invite) {
    return (
      <CenteredShell>
        <div className="grid gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">This invite doesn&apos;t work</h1>
          <p className="text-muted-foreground">
            The code may have been reset. Ask a housemate for a fresh link, or enter a code yourself.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/onboarding">Enter a code</Link>
        </Button>
      </CenteredShell>
    )
  }

  return (
    <CenteredShell>
      <Card>
        <CardHeader>
          <span className="mb-2 inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-6" aria-hidden />
          </span>
          <CardTitle className="text-xl">
            {invite.is_member ? `You're already in ${invite.household_name}` : `Join ${invite.household_name}?`}
          </CardTitle>
          <CardDescription>
            {invite.is_member
              ? "Nothing to do here. Open it to see the pantry."
              : `${invite.member_count} ${invite.member_count === 1 ? "person shares" : "people share"} this pantry and shopping list.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invite.is_member ? (
            <OpenHouseholdButton householdId={invite.household_id} label={`Open ${invite.household_name}`} />
          ) : (
            <JoinHouseholdForm defaultCode={code} />
          )}
        </CardContent>
      </Card>
    </CenteredShell>
  )
}
