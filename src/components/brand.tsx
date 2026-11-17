import { LOGO_COLORS, LogoGlyph } from "@/components/logo-glyph"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-xl shadow-sm shadow-black/15 ring-1 ring-black/5 ring-inset",
        className,
      )}
      // The logo keeps its own green in both themes; dark mode's lighter primary washes it out.
      style={{ backgroundColor: LOGO_COLORS.green }}
    >
      <LogoGlyph className="size-[72%] translate-y-[3%]" />
    </span>
  )
}

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-heading text-xl font-semibold tracking-tight">
      <BrandMark className="size-8 rounded-[0.6rem]" />
      LazyChef
    </span>
  )
}
