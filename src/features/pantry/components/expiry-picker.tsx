"use client"

import { CalendarDays, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { addDays } from "../dates"
import { shortDate } from "../display"
import { QUICK_EXPIRY } from "../staples"

const CHIP =
  "relative inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 focus-within:ring-3 focus-within:ring-ring/50 focus-visible:ring-3 focus-visible:ring-ring/50"
const CHIP_OFF = "border-border bg-background hover:bg-muted dark:border-input dark:bg-input/30"
const CHIP_ON = "border-primary bg-primary text-primary-foreground"

/**
 * Expiry as quick chips ("3 days", "1 week", "2 weeks") plus a date picker.
 * `value` is YYYY-MM-DD or "" (none). Tapping the selected chip clears it.
 */
export function ExpiryPicker({
  value,
  onChange,
  today,
  label = "Expires",
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  today: string
  /** Accessible name for the group, e.g. "Chicken expires". */
  label?: string
  disabled?: boolean
  className?: string
}) {
  const quick = QUICK_EXPIRY.map((option) => ({ ...option, date: addDays(today, option.days) }))
  const custom = value !== "" && !quick.some((option) => option.date === value)

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {quick.map((option) => {
        const selected = option.date === value
        return (
          <button
            key={option.days}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            aria-label={`${option.label} (${shortDate(option.date)})`}
            onClick={() => onChange(selected ? "" : option.date)}
            className={cn(CHIP, selected ? CHIP_ON : CHIP_OFF)}
          >
            {option.label}
          </button>
        )
      })}
      {/* A real date input stretched over the chip, so the phone's own date picker opens. */}
      <label className={cn(CHIP, custom ? CHIP_ON : CHIP_OFF, !custom && "w-11 px-0", disabled && "pointer-events-none opacity-50")}>
        <CalendarDays className="size-4" aria-hidden />
        {custom ? shortDate(value) : null}
        <span className="sr-only">{custom ? "Change expiry date" : "Pick an expiry date"}</span>
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.()
            } catch {
              // Not allowed here (e.g. no user gesture); the input's own UI still works.
            }
          }}
          className="absolute inset-0 size-full cursor-pointer appearance-none text-base opacity-0"
        />
      </label>
      {custom ? (
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          aria-label="Clear expiry date"
          className={cn(CHIP, CHIP_OFF, "w-11 px-0")}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
