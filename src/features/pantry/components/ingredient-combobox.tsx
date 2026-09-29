"use client"

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { CATEGORY_META, type CatalogEntry } from "@/lib/ingredients/types"
import { cn } from "@/lib/utils"

import { insertPastedLines } from "../autocomplete"
import { matchRange, replaceNameAtCaret, suggestionQuery } from "../suggest"
import { useCatalogSearch } from "./use-catalog-search"

const MAX_SUGGESTIONS = 6

/**
 * The add-food box: free text ("2 lbs chicken breast, milk") with suggestions from the
 * ingredient library for the item at the caret. Picking one keeps the typed amount and
 * the focus. Arrow keys + Enter pick; Enter with nothing highlighted submits the form.
 * Pasted lines become comma-separated items.
 */
export function IngredientCombobox({
  value,
  onValueChange,
  inputRef,
  disabled,
  className,
  ...props
}: {
  value: string
  onValueChange: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  disabled?: boolean
  className?: string
} & Pick<React.ComponentProps<"input">, "id" | "placeholder" | "aria-label" | "aria-describedby" | "aria-invalid">) {
  const listId = useId()
  const { search, load } = useCatalogSearch()
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState<number | null>(null)
  // The text the list was closed for (Escape, or right after a pick); typing reopens it.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [active, setActive] = useState<{ name: string; index: number }>({ name: "", index: -1 })
  const restoreCaret = useRef<number | null>(null)

  const at = Math.min(caret ?? value.length, value.length)
  const query = focused ? suggestionQuery(value, at) : null
  const name = query?.name ?? ""
  const suggestions = useMemo(() => (name && search ? search(name, MAX_SUGGESTIONS) : []), [name, search])
  const open = suggestions.length > 0 && dismissedFor !== value
  const activeIndex = open && active.name === name ? Math.min(active.index, suggestions.length - 1) : -1

  // After a pick, put the caret back after the new name (React moves it to the end).
  useLayoutEffect(() => {
    const input = inputRef.current
    const position = restoreCaret.current
    if (!input || position === null) return
    restoreCaret.current = null
    input.setSelectionRange(position, position)
    // Setting the value scrolls a long line back to its start, hiding the caret; the usual
    // case (pasting or picking at the end) scrolls it back into view.
    if (position === input.value.length) input.scrollLeft = input.scrollWidth
  }, [value, inputRef])

  function pick(entry: CatalogEntry) {
    if (!query) return
    const next = replaceNameAtCaret(value, at, query.amountText, entry.name)
    if (next.text !== value) restoreCaret.current = next.caret
    setCaret(next.caret)
    setDismissedFor(next.text)
    onValueChange(next.text)
    inputRef.current?.focus()
  }

  function move(step: number) {
    const count = suggestions.length
    const from = activeIndex === -1 ? (step > 0 ? -1 : count) : activeIndex
    setActive({ name, index: (from + step + count) % count })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open && suggestions.length > 0) {
        event.preventDefault()
        setDismissedFor(null)
        setActive({ name, index: event.key === "ArrowDown" ? 0 : suggestions.length - 1 })
        return
      }
      if (open) {
        event.preventDefault()
        move(event.key === "ArrowDown" ? 1 : -1)
      }
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      pick(suggestions[activeIndex])
    } else if (event.key === "Escape" && open) {
      // The sheet sees aria-expanded and stays open (see QuickAddSheet); this just closes the list.
      setDismissedFor(value)
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const pasted = insertPastedLines(
      value,
      input.selectionStart ?? value.length,
      input.selectionEnd ?? value.length,
      event.clipboardData.getData("text"),
    )
    if (!pasted) return
    event.preventDefault()
    // Same text (pasting over an identical selection) won't re-render, so place the caret now
    // rather than leaving it queued for some later keystroke.
    if (pasted.text === value) input.setSelectionRange(pasted.caret, pasted.caret)
    else restoreCaret.current = pasted.caret
    setCaret(pasted.caret)
    setDismissedFor(pasted.text)
    onValueChange(pasted.text)
  }

  return (
    <div className={cn("grid grid-cols-1 gap-1", className)}>
      <Input
        {...props}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={5000}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          setCaret(event.target.selectionStart)
          onValueChange(event.target.value)
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onFocus={() => {
          setFocused(true)
          load()
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="h-12"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!open}
        className="grid grid-cols-1 gap-0.5 rounded-xl border bg-popover p-1 shadow-sm"
      >
        {open
          ? suggestions.map((entry, index) => (
              <SuggestionOption
                key={entry.name}
                id={`${listId}-${index}`}
                entry={entry}
                query={name}
                selected={index === activeIndex}
                onPick={() => pick(entry)}
              />
            ))
          : null}
      </ul>
      <span className="sr-only" aria-live="polite">
        {open ? `${suggestions.length} ${suggestions.length === 1 ? "suggestion" : "suggestions"}` : ""}
      </span>
    </div>
  )
}

function SuggestionOption({
  id,
  entry,
  query,
  selected,
  onPick,
}: {
  id: string
  entry: CatalogEntry
  query: string
  selected: boolean
  onPick: () => void
}) {
  const meta = CATEGORY_META[entry.category] ?? CATEGORY_META.other
  const range = matchRange(entry.name, query)
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-label={`${entry.name}, ${meta.label}`}
      // Keeps focus (and the phone keyboard) in the input.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-base select-none hover:bg-muted/70 aria-selected:bg-muted md:text-sm"
    >
      <span className="text-xl leading-none" aria-hidden>
        {meta.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {range ? (
          <>
            {entry.name.slice(0, range[0])}
            <span className="font-semibold">{entry.name.slice(range[0], range[1])}</span>
            {entry.name.slice(range[1])}
          </>
        ) : (
          entry.name
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{meta.label}</span>
    </li>
  )
}
