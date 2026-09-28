"use client"

import { Check, LogOut } from "lucide-react"
import { useTransition } from "react"

import { ConfirmButton } from "@/components/confirm-button"
import { Button } from "@/components/ui/button"
import { leaveHousehold, switchHousehold } from "@/features/household/actions"

export function LeaveHouseholdButton({
  householdId,
  householdName,
  lastMember,
}: {
  householdId: string
  householdName: string
  lastMember: boolean
}) {
  return (
    <ConfirmButton
      trigger={
        <Button variant="destructive" className="w-full">
          <LogOut />
          Leave household
        </Button>
      }
      title={`Leave ${householdName}?`}
      description={
        lastMember
          ? "You're the only member, so the household and everything in it will be deleted."
          : "You'll lose access to its pantry and shopping list. Someone can invite you back."
      }
      confirmLabel={lastMember ? "Leave and delete" : "Leave"}
      destructive
      onConfirm={() => leaveHousehold(householdId)}
    />
  )
}

export function OpenHouseholdButton({ householdId, label }: { householdId: string; label: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={() => startTransition(() => switchHousehold(householdId))}>
      {pending ? "Opening…" : label}
    </Button>
  )
}

export function HouseholdSwitcher({
  activeId,
  households,
}: {
  activeId: string
  households: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  return (
    <ul className="grid gap-2">
      {households.map((h) => {
        const active = h.id === activeId
        return (
          <li key={h.id}>
            <Button
              variant={active ? "secondary" : "outline"}
              className="w-full justify-between"
              disabled={active || pending}
              onClick={() => startTransition(() => switchHousehold(h.id))}
            >
              <span className="truncate">{h.name}</span>
              {active ? <Check className="text-primary" /> : <span className="text-xs text-muted-foreground">Switch</span>}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
