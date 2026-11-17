"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A toggle chip (Figma: Toggle). Pressed chips get a soft primary tint, a primary border
 * and a check, so "on" never relies on color alone.
 */
export function ChoiceChip({
  pressed,
  onPressedChange,
  children,
  disabled,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        pressed
          ? "border-primary bg-primary/10 pr-4 pl-3 text-foreground"
          : "bg-card px-4 hover:bg-muted active:bg-muted",
      )}
    >
      {pressed ? <Check className="size-4 text-primary" aria-hidden /> : null}
      {children}
    </button>
  )
}

/** A labelled group of chips. */
export function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2.5 flex items-baseline gap-2 text-sm">
        <span className="font-medium">{legend}</span>
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}
