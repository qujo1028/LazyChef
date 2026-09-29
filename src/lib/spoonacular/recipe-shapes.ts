// Validates Spoonacular recipe responses into small, predictable shapes. Pure, so it's
// testable and the types can be shared with client components. These shapes are also
// what gets cached, so keep them free of anything we aren't allowed to keep an hour.

export type RecipeIngredient = {
  /** Spoonacular ingredient id; null when it has none. */
  id: number | null
  /** Lowercase: "chicken breast". */
  name: string
  /** The recipe's own line: "2 boneless chicken breasts, diced". */
  original: string
  amount: number | null
  /** As Spoonacular wrote it ("cups", "", "cloves"). */
  unit: string
  aisle: string | null
}

export type RecipeSummary = {
  id: number
  title: string
  image: string | null
  /** Only complexSearch fills these in. */
  readyInMinutes: number | null
  servings: number | null
  /** Recipe ingredients that matched what we sent. */
  used: RecipeIngredient[]
  /** Recipe ingredients that didn't. */
  missed: RecipeIngredient[]
}

export type RecipeDetail = {
  id: number
  title: string
  image: string | null
  readyInMinutes: number | null
  servings: number | null
  sourceUrl: string | null
  sourceName: string | null
  /** Plain text, tags stripped. */
  summary: string | null
  ingredients: RecipeIngredient[]
  /** Numbered steps in order; falls back to splitting plain instructions. */
  steps: string[]
  dishTypes: string[]
}

type Raw = Record<string, unknown>

function record(value: unknown): Raw | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

/** Only http(s) links, so a bad response can't smuggle in javascript: URLs. */
export function safeUrl(value: unknown): string | null {
  const raw = text(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/** "<b>Tasty</b> &amp; quick" → "Tasty & quick". */
export function stripHtml(value: unknown): string {
  return text(
    text(value)
      .replace(/<(br|\/p|\/li)\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match),
  )
}

export function toRecipeIngredient(value: unknown): RecipeIngredient | null {
  const raw = record(value)
  if (!raw) return null
  const name = text(raw.nameClean) || text(raw.name)
  const original = text(raw.original) || name
  if (!name) return null
  const aisle = text(raw.aisle)
  return {
    id: positiveInt(raw.id),
    name: name.toLowerCase(),
    original,
    amount: positiveNumber(raw.amount),
    unit: text(raw.unit),
    aisle: aisle && aisle !== "?" ? aisle : null,
  }
}

function ingredients(value: unknown): RecipeIngredient[] {
  return Array.isArray(value) ? value.flatMap((item) => toRecipeIngredient(item) ?? []) : []
}

/** One result from findByIngredients or complexSearch (with fillIngredients). */
export function toRecipeSummary(value: unknown): RecipeSummary | null {
  const raw = record(value)
  const id = positiveInt(raw?.id)
  const title = text(raw?.title)
  if (!raw || id === null || !title) return null
  return {
    id,
    title,
    image: safeUrl(raw.image),
    readyInMinutes: positiveInt(raw.readyInMinutes),
    servings: positiveInt(raw.servings),
    used: ingredients(raw.usedIngredients),
    missed: ingredients(raw.missedIngredients),
  }
}

function steps(raw: Raw): string[] {
  const analyzed = Array.isArray(raw.analyzedInstructions) ? raw.analyzedInstructions : []
  const fromAnalyzed = analyzed.flatMap((section) => {
    const list = record(section)?.steps
    return Array.isArray(list) ? list.map((step) => stripHtml(record(step)?.step)).filter(Boolean) : []
  })
  if (fromAnalyzed.length > 0) return fromAnalyzed
  // Plain instructions: often <ol><li>…</li></ol>, sometimes just paragraphs.
  const plain = text(raw.instructions)
  if (!plain) return []
  return plain
    .split(/<\/li>|<\/p>|<br\s*\/?>|\n/i)
    .map(stripHtml)
    .filter(Boolean)
}

/** The /recipes/{id}/information response. */
export function toRecipeDetail(value: unknown): RecipeDetail | null {
  const raw = record(value)
  const id = positiveInt(raw?.id)
  const title = text(raw?.title)
  if (!raw || id === null || !title) return null

  // The same ingredient can be listed twice (for the sauce and the filling); keep both lines.
  return {
    id,
    title,
    image: safeUrl(raw.image),
    readyInMinutes: positiveInt(raw.readyInMinutes),
    servings: positiveInt(raw.servings),
    sourceUrl: safeUrl(raw.sourceUrl),
    sourceName: text(raw.sourceName) || text(raw.creditsText) || null,
    summary: stripHtml(raw.summary) || null,
    ingredients: ingredients(raw.extendedIngredients),
    steps: steps(raw),
    dishTypes: Array.isArray(raw.dishTypes) ? raw.dishTypes.map(text).filter(Boolean) : [],
  }
}
