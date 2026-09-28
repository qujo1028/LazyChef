import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { signOut } from "@/features/auth/actions"
import { cn } from "@/lib/utils"

export function SignOutButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <form action={signOut} className={cn(compact ? "" : "w-full", className)}>
      <Button type="submit" variant={compact ? "ghost" : "outline"} size={compact ? "sm" : "default"} className={compact ? "" : "w-full"}>
        <LogOut />
        Sign out
      </Button>
    </form>
  )
}
