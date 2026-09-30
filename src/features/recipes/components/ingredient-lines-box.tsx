"use client"

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Textarea } from "@/components/ui/textarea"
import { SuggestionOption } from "@/features/pantry/components/ingredient-combobox"
import { useCatalogSearch } from "@/features/pantry/components/use-catalog-search"
import { replaceNameAtCaret, suggestionQuery } from "@/features/pantry/suggest"

const MAX_SUGGESTIONS = 5

/**
 * The recipe form's ingredient box: one ingredient per line ("2 cloves garlic"), with the
 * pantry's ingredient suggestions for the line at the caret. Picking one keeps the typed
 * amount. Arrow keys + Enter pick; Enter with nothing highlighted starts a new line.
 */
export function IngredientLinesBox({
  value,
  onValueChange,
  id,
  invalid,
  describedBy,
  disabled,
}: {
  value: string
  onValueChange: (value: string) => void
  id: string
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
}) {
  const listId = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const { search, load } = useCatalogSearch()
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState<number | null>(null)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [active, setActive] = useState<{ name: string; index: number }>({ name: "", index: -1 })
  const restoreCaret = useRef<number | null>(null)

  const at = Math.min(caret ?? value.length, value.length)
  const query = focused ? suggestionQuery(value, at) : null
  const name = query?.name ?? ""
  const suggestions = useMemo(() => (name && search ? search(name, MAX_SUGGESTIONS) : []), [name, search])
  const open = suggestions.length > 0 && dismissedFor !== value
  const activeIndex = open && active.name === name ? Math.min(active.index, suggestions.length - 1) : -1

  useLayoutEffect(() => {
    const box = ref.current
    const position = restoreCaret.current
    if (!box || position === null) return
    restoreCaret.current = null
    box.setSelectionRange(position, position)
  }, [value])

  function pick(index: number) {
    const entry = suggestions[index]
    if (!query || !entry) return
    const next = replaceNameAtCaret(value, at, query.amountText, entry.name)
    restoreCaret.current = next.caret
    setCaret(next.caret)
    setDismissedFor(next.text)
    onValueChange(next.text)
    ref.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || !open) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const count = suggestions.length
      const step = event.key === "ArrowDown" ? 1 : -1
      const from = activeIndex === -1 ? (step > 0 ? -1 : count) : activeIndex
      setActive({ name, index: (from + step + count) % count })
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault()
      pick(activeIndex)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setDismissedFor(value)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-1">
      <Textarea
        ref={ref}
        id={id}
        value={value}
        rows={8}
        maxLength={20_000}
        placeholder={"2 cloves garlic\n1 lb chicken breast\n1 can coconut milk\nrice"}
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
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
        className="min-h-48 px-3 py-2.5 text-base leading-relaxed md:text-base"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Ingredient suggestions"
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
                onPick={() => pick(index)}
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
