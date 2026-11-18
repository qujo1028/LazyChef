"use client"

import { X } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"

import { nextPrompt, type UnratedCook } from "../ratings-core"
import { RatingButtons } from "./rating-buttons"

const STORAGE_KEY = "lazychef:dismissed-rating-prompts"
const listeners = new Set<() => void>()

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]"
  } catch {
    return "[]"
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function dismiss(key: string) {
  try {
    const keys: unknown = JSON.parse(read())
    const next = [...(Array.isArray(keys) ? keys.filter((k) => typeof k === "string") : []), key].slice(-200)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: the card still goes away for this visit (see `gone`).
  }
  for (const listener of listeners) listener()
}

function parse(raw: string): Set<string> {
  try {
    const keys: unknown = JSON.parse(raw)
    return new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [])
  } catch {
    return new Set()
  }
}

/**
 * "How was <title>?" for the viewer's cooks from an earlier day they haven't rated. One at
 * a time, newest first; the X hides that cook on this device.
 */
export function RatingPrompt({ cooks }: { cooks: UnratedCook[] }) {
  const raw = useSyncExternalStore(subscribe, read, () => "[]")
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const [thanked, setThanked] = useState<string | null>(null)
  const hidden = new Set([...parse(raw), ...gone])
  const cook = nextPrompt(cooks, hidden)

  if (thanked && !cook) return <p className="text-center text-sm text-muted-foreground">Thanks! Noted for “{thanked}”.</p>
  if (!cook) return null

  function close(key: string) {
    setGone((current) => new Set([...current, key]))
    dismiss(key)
  }

  return (
    <section aria-label="Rate a recent cook" className="flex items-center gap-3 rounded-2xl border bg-card py-2 pr-1.5 pl-4">
      <p className="min-w-0 flex-1 text-sm font-medium break-words">How was {cook.title}?</p>
      <RatingButtons
        key={cook.key}
        recipeId={cook.ref}
        title={cook.title}
        onRated={() => {
          setThanked(cook.title)
          // Rated: the server won't offer it again; hide it now.
          setGone((current) => new Set([...current, cook.key]))
        }}
      />
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Dismiss" onClick={() => close(cook.key)}>
        <X aria-hidden />
      </Button>
    </section>
  )
}
