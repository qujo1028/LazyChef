import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}

export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null
  className?: string
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {src ? <AvatarImage src={src} alt="" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
