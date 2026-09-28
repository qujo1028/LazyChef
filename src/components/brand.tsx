import { ChefHat } from "lucide-react"

import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground",
        className,
      )}
    >
      <ChefHat className="size-5" aria-hidden />
    </span>
  )
}

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <BrandMark className="size-8 rounded-lg" />
      LazyChef
    </span>
  )
}
