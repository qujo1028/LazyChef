"use client"

import { Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Shares the household's join link (native share sheet when there is one, else copies it). */
export function InviteButton({ householdName, inviteCode }: { householdName: string; inviteCode: string }) {
  async function share() {
    const url = `${window.location.origin}/join/${inviteCode}`
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
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Invite link copied")
    } catch {
      toast.error("Couldn't copy the link. Use Invite housemates on the Household tab.")
    }
  }

  return (
    <Button type="button" onClick={() => void share()}>
      <Share2 aria-hidden />
      Invite a housemate
    </Button>
  )
}
