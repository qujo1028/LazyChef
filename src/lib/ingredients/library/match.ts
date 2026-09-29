// Word-containment matching behind findIngredient(). Shared by the catalog (runtime) and
// scripts/build-ingredient-library.mjs (which files Spoonacular rows under the curated entries they
// name). Pure and dependency-free, erasable TypeScript only (Node runs it with type stripping).
//
// Everything here works on normalized keys (see ./normalize): folded, singular, filler dropped.

/** One name (or alias) of an entry. */
export type MatchName = {
  /** Normalized key, e.g. "chicken breast". */
  key: string
  /** Index of the entry this name belongs to (caller's numbering). */
  entry: number
  /** Commonness, 1 (staple) … 5 (rare). Breaks ties between equally specific matches. */
  tier: number
}

export type Match = {
  entry: number
  /** The words of the name that matched ("chicken breast" → ["chicken", "breast"]). */
  words: readonly string[]
  exact: boolean
}

export type Matcher = {
  /** Best entry for a normalized key, or null. */
  find(key: string): Match | null
}

type Candidate = { entry: number; tier: number; words: readonly string[] }

/** Package and unit words that sometimes trail a name ("butter sticks", "celery bunch"). */
const TRAILING_PACKAGING = new Set([
  "bag",
  "block",
  "bottle",
  "box",
  "bunch",
  "can",
  "carton",
  "container",
  "head",
  "jar",
  "loaf",
  "pack",
  "package",
  "packet",
  "slice",
  "stick",
  "tub",
])

/** "X with Y", "X in Y": X is the thing ("pasta sauce with meat", "tuna in water"). */
const CONNECTORS = new Set(["with", "w", "in"])

/** A contained name, with how many of its last words end the phrase in the same order. */
type Scored = { candidate: Candidate; tail: number }

/** Words at the end of `phrase` (before index `end`) that `words` also ends with, in order. */
function tailLength(words: readonly string[], phrase: readonly string[], end: number): number {
  let n = 0
  while (n < words.length && n < end && words[words.length - 1 - n] === phrase[end - 1 - n]) n++
  return n
}

/**
 * The longer run of words ending the phrase wins ("unsalted peanut butter": "peanut butter" over
 * "unsalted butter"; "reduced fat chocolate milk": "chocolate milk" over "reduced fat milk"),
 * then more words, then the more common entry.
 */
function better(a: Scored, b: Scored | null): boolean {
  if (!b) return true
  if (a.tail !== b.tail) return a.tail > b.tail
  if (a.candidate.words.length !== b.candidate.words.length) return a.candidate.words.length > b.candidate.words.length
  if (a.candidate.tier !== b.candidate.tier) return a.candidate.tier < b.candidate.tier
  return a.candidate.entry < b.candidate.entry
}

/**
 * Builds a matcher over the given names. Lookup order for a key:
 * 1. an exact name or alias;
 * 2. the most specific name whose words all appear in the key and that ends with the key's last
 *    word (English puts the thing itself last: "kerrygold unsalted butter" → "unsalted butter",
 *    "peanut butter cookie" → "cookie", not "peanut butter"); among those, the one ending with
 *    the longest run of the key's last words ("unsalted peanut butter" → "peanut butter");
 * 3. failing that, the most specific contained name ending elsewhere, but only when none of the
 *    leftover words is itself the last word of some name ("chicken breast boneless" → chicken
 *    breast, but "chicken salad sandwich" stays unknown because "sandwich" names other things).
 * Steps 2–3 run on the part before "with"/"in" first, and ignore trailing package words.
 */
export function createMatcher(names: readonly MatchName[]): Matcher {
  const exact = new Map<string, Candidate>()
  const byLastWord = new Map<string, Candidate[]>()
  for (const name of names) {
    if (!name.key) continue
    const words = name.key.split(" ")
    const candidate: Candidate = { entry: name.entry, tier: name.tier, words }
    const known = exact.get(name.key)
    if (!known || name.tier < known.tier) exact.set(name.key, candidate)
    const last = words[words.length - 1]
    const list = byLastWord.get(last)
    if (list) list.push(candidate)
    else byLastWord.set(last, [candidate])
  }

  /** Best contained name whose last word is words[end - 1]. */
  function bestEndingAt(words: readonly string[], end: number, present: ReadonlySet<string>): Scored | null {
    let best: Scored | null = null
    for (const candidate of byLastWord.get(words[end - 1]) ?? []) {
      if (!candidate.words.every((w) => present.has(w))) continue
      const scored = { candidate, tail: tailLength(candidate.words, words, end) }
      if (better(scored, best)) best = scored
    }
    return best
  }

  function contained(words: readonly string[]): Candidate | null {
    if (words.length === 0) return null
    const present = new Set(words)
    const head = bestEndingAt(words, words.length, present)
    if (head) return head.candidate
    let best: Scored | null = null
    for (let end = words.length - 1; end >= 1; end--) {
      const scored = bestEndingAt(words, end, present)
      if (scored && better(scored, best)) best = scored
    }
    if (!best) return null
    const covered = new Set(best.candidate.words)
    const leftoverNamesSomething = words.some((w) => !covered.has(w) && byLastWord.has(w))
    return leftoverNamesSomething ? null : best.candidate
  }

  function trimPackaging(words: string[]): string[] {
    let end = words.length
    while (end > 1 && TRAILING_PACKAGING.has(words[end - 1])) end--
    return end === words.length ? words : words.slice(0, end)
  }

  return {
    find(key) {
      if (!key) return null
      const hit = exact.get(key)
      if (hit) return { entry: hit.entry, words: hit.words, exact: true }

      const words = trimPackaging(key.split(" "))
      const trimmed = words.join(" ")
      if (trimmed !== key) {
        const trimmedHit = exact.get(trimmed)
        if (trimmedHit) return { entry: trimmedHit.entry, words: trimmedHit.words, exact: false }
      }

      const connector = words.findIndex((w, i) => i > 0 && CONNECTORS.has(w))
      const phrases = connector > 0 ? [trimPackaging(words.slice(0, connector)), words] : [words]
      for (const phrase of phrases) {
        if (phrase !== words) {
          const phraseHit = exact.get(phrase.join(" "))
          if (phraseHit) return { entry: phraseHit.entry, words: phraseHit.words, exact: false }
        }
        const found = contained(phrase)
        if (found) return { entry: found.entry, words: found.words, exact: false }
      }
      return null
    },
  }
}
