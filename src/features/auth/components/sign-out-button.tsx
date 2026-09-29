"use client"

import { LogOut } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { signOut } from "@/features/auth/actions"
import { actionError, callAction } from "@/lib/call-action"
import { cn } from "@/lib/utils"

export function SignOutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <form
      action={async () => {
        const error = actionError(await callAction(signOut))
        if (error) toast.error(error)
      }}
      className={cn(compact ? "" : "w-full", className)}
    >
      <Button type="submit" variant={compact ? "ghost" : "outline"} className={compact ? "h-11" : "h-11 w-full"}>
        <LogOut />
        Sign out
      </Button>
    </form>
  )
}
