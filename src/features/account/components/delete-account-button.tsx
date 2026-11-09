"use client"

import { Trash2 } from "lucide-react"

import { ConfirmButton } from "@/components/confirm-button"
import { Button } from "@/components/ui/button"
import { deleteAccount } from "@/features/account/actions"
import { callAction } from "@/lib/call-action"

export function DeleteAccountButton() {
  return (
    <ConfirmButton
      trigger={
        <Button variant="ghost" className="h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 />
          Delete account
        </Button>
      }
      title="Delete your account?"
      description="This can't be undone. Households where you're the only member are deleted with everything in them. Shared households stay with your housemates, who keep the pantry, list and recipes, without your name on them."
      confirmLabel="Delete account"
      destructive
      onConfirm={() => callAction(deleteAccount)}
    />
  )
}
