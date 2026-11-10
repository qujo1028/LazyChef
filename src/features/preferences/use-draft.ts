"use client"

import { useCallback, useSyncExternalStore } from "react"

import { clearDraft, EMPTY_DRAFT, readDraft, writeDraft, type FirstRunDraft } from "./draft"

// The first-run draft as a tiny external store: the server (and the first client render)
// sees an empty draft, then the browser's saved one, without a hydration mismatch.

const listeners = new Set<() => void>()
let cached: FirstRunDraft | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("lazychef:")) {
      cached = null
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function snapshot() {
  cached ??= readDraft()
  return cached
}

function emit() {
  for (const listener of listeners) listener()
}

export function setDraft(next: FirstRunDraft) {
  cached = next
  writeDraft(next)
  emit()
}

export function resetDraft() {
  cached = EMPTY_DRAFT
  clearDraft()
  emit()
}

export function useFirstRunDraft(): [FirstRunDraft, (change: (draft: FirstRunDraft) => FirstRunDraft) => void] {
  const draft = useSyncExternalStore(subscribe, snapshot, () => EMPTY_DRAFT)
  const update = useCallback((change: (draft: FirstRunDraft) => FirstRunDraft) => setDraft(change(snapshot())), [])
  return [draft, update]
}
