// The Home tab's recipe row: recipes other households cooked lately first, then library picks that
// change each day. Pure, so Vitest can run it.

export type TrendingRow = {
  id: string
  title: string
  image_url: string | null
  ready_in_minutes: number | null
  household_count: number
}

export type PoolRecipe = Pick<TrendingRow, "id" | "title" | "image_url" | "ready_in_minutes">

export type HomeRecipeTag = "Trending" | "Try something new"

export type HomeRecipeCard = {
  id: string
  title: string
  image: string | null
  readyInMinutes: number | null
  tag: HomeRecipeTag
  /** Different households that cooked it this week; null on "Try something new". */
  householdCount: number | null
}

export const HOME_RECIPE_TARGET = 10

/** FNV-1a: a small string hash to seed the shuffle. */
function hashString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** mulberry32: a tiny seeded random number generator (0 up to 1). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates on a copy. The same seed always gives the same order. */
function shuffled<T>(items: readonly T[], seed: string): T[] {
  const random = mulberry32(hashString(seed))
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Up to `target` cards: trending recipes first (in the order given, tagged "Trending"), then library
 * picks tagged "Try something new". The picks are shuffled by `dayKey` (YYYY-MM-DD in the viewer's
 * zone), so the row is stable all day and changes tomorrow. Recipes with a photo come first.
 */
export function buildHomeRecipes(
  trending: readonly TrendingRow[],
  pool: readonly PoolRecipe[],
  dayKey: string,
  target = HOME_RECIPE_TARGET,
): HomeRecipeCard[] {
  const seen = new Set<string>()
  const cards: HomeRecipeCard[] = []

  for (const row of trending) {
    if (cards.length >= target) break
    if (seen.has(row.id)) continue
    seen.add(row.id)
    cards.push({
      id: row.id,
      title: row.title,
      image: row.image_url,
      readyInMinutes: row.ready_in_minutes,
      tag: "Trending",
      householdCount: row.household_count,
    })
  }

  if (cards.length < target) {
    // Sort the pool by id first so the shuffle does not depend on the order the database returned.
    const fresh = pool.filter((r) => !seen.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const withImage = shuffled(
      fresh.filter((r) => r.image_url),
      `${dayKey}:image`,
    )
    const without = shuffled(
      fresh.filter((r) => !r.image_url),
      `${dayKey}:plain`,
    )
    for (const r of [...withImage, ...without]) {
      if (cards.length >= target) break
      cards.push({
        id: r.id,
        title: r.title,
        image: r.image_url,
        readyInMinutes: r.ready_in_minutes,
        tag: "Try something new",
        householdCount: null,
      })
    }
  }
  return cards
}

/** "Cooked by 3 households" for a trending card; null otherwise. */
export function trendingLine(card: Pick<HomeRecipeCard, "tag" | "householdCount">): string | null {
  if (card.tag !== "Trending" || card.householdCount === null) return null
  return `Cooked by ${card.householdCount} ${card.householdCount === 1 ? "household" : "households"}`
}
