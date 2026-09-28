"use client"

import { UserMinus } from "lucide-react"

import { ConfirmButton } from "@/components/confirm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { removeMember } from "@/features/household/actions"

type Member = {
  userId: string
  role: "owner" | "member"
  displayName: string
  avatarUrl: string | null
}

export function MemberList({
  householdId,
  members,
  viewerId,
  viewerIsOwner,
}: {
  householdId: string
  members: Member[]
  viewerId: string
  viewerIsOwner: boolean
}) {
  return (
    <ul className="divide-y">
      {members.map((member) => {
        const isViewer = member.userId === viewerId
        return (
          <li key={member.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <UserAvatar name={member.displayName} src={member.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {member.displayName}
                {isViewer ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
              </p>
            </div>
            {member.role === "owner" ? <Badge variant="secondary">Owner</Badge> : null}
            {viewerIsOwner && !isViewer ? (
              <ConfirmButton
                trigger={
                  <Button variant="ghost" size="icon" aria-label={`Remove ${member.displayName}`}>
                    <UserMinus />
                  </Button>
                }
                title={`Remove ${member.displayName}?`}
                description="They'll lose access to this household's pantry and shopping list. You can invite them back later."
                confirmLabel="Remove"
                successMessage={`${member.displayName} removed`}
                destructive
                onConfirm={() => removeMember(householdId, member.userId)}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
