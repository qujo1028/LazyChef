"use client"

import { Copy, RefreshCw, Share2 } from "lucide-react"
import { toast } from "sonner"

import { ConfirmButton } from "@/components/confirm-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { regenerateInviteCode } from "@/features/household/actions"
import { formatInviteCode } from "@/lib/invite"

export function InviteCard({
  householdId,
  householdName,
  inviteCode,
  isOwner,
}: {
  householdId: string
  householdName: string
  inviteCode: string
  isOwner: boolean
}) {
  const pretty = formatInviteCode(inviteCode)

  function inviteLink() {
    return `${window.location.origin}/join/${inviteCode}`
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error(`Couldn't copy. The code is ${pretty}`)
    }
  }

  async function share() {
    const url = inviteLink()
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join our LazyChef household",
          text: `Join "${householdName}" on LazyChef so we share one pantry and shopping list.`,
          url,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
      }
    }
    await copy(url, "Invite link")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite housemates</CardTitle>
        <CardDescription>Anyone with the link or code can join this household.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <span className="font-mono text-xl font-semibold tracking-[0.2em]" aria-label={`Invite code ${pretty}`}>
            {pretty}
          </span>
          <Button variant="ghost" size="icon" onClick={() => copy(pretty, "Code")} aria-label="Copy invite code">
            <Copy />
          </Button>
        </div>
        <Button size="lg" onClick={share}>
          <Share2 />
          Share invite link
        </Button>
        {isOwner ? (
          <ConfirmButton
            trigger={
              <Button variant="ghost" size="sm" className="justify-self-center text-muted-foreground">
                <RefreshCw />
                Reset code
              </Button>
            }
            title="Reset the invite code?"
            description="The current code and link stop working. People already in the household stay."
            confirmLabel="Reset code"
            successMessage="New invite code ready"
            onConfirm={() => regenerateInviteCode(householdId)}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
