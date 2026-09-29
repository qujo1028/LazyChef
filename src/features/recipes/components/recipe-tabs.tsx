"use client"

import { useId, useState, type KeyboardEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type RecipeTab = { id: "make-now" | "almost-there"; label: string; count: number; panel: ReactNode }

/** "Make now" / "Almost there". Opens on Make now unless it's empty. */
export function RecipeTabs({ tabs }: { tabs: RecipeTab[] }) {
  const [active, setActive] = useState(() => (tabs.find((tab) => tab.count > 0) ?? tabs[0]).id)
  const base = useId()

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const i = tabs.findIndex((tab) => tab.id === active)
    const next = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]
    setActive(next.id)
    document.getElementById(`${base}-${next.id}-tab`)?.focus()
  }

  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label="Recipes" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              id={`${base}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "h-11 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label} <span className={cn("tabular-nums", !selected && "opacity-70")}>· {tab.count}</span>
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${base}-${tab.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${base}-${tab.id}-tab`}
          hidden={tab.id !== active}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
