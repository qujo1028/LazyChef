// Text helpers shared by the catalog (runtime) and scripts/build-ingredient-library.mjs (build time),
// so the library's keys are computed exactly the way lookups compute them.
// Keep this file dependency-free and use only erasable TypeScript: Node runs it with type stripping.

/** Longest ingredient key; also the category_overrides.ingredient_key limit. */
export const MAX_KEY_LENGTH = 80

const FOLD_CHARS: Record<string, string> = { æ: "ae", œ: "oe", ø: "o", ß: "ss", ł: "l", đ: "d", ı: "i" }

/**
 * Lowercase ASCII words separated by single spaces: accents stripped ("jalapeño" → "jalapeno"),
 * apostrophes dropped ("reese's" → "reeses"), "&" → "and", "%" → "percent", other punctuation → space.
 */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[æœøßłđı]/g, (c) => FOLD_CHARS[c] ?? c)
    .replace(/['’‘`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Words that end in "s" but are already singular (or read wrong without it). */
const INVARIANT = new Set([
  "anis",
  "asparagus",
  "beaujolais",
  "brussels",
  "calvados",
  "carnitas",
  "cassis",
  "chablis",
  "citrus",
  "couscous",
  "gras",
  "grits",
  "herbes",
  "hibiscus",
  "hummus",
  "kansas",
  "madras",
  "manis",
  "molasses",
  "octopus",
  "pastis",
  "physalis",
  "pils",
  "rooibos",
  "schnapps",
  "series",
  "species",
  "swiss",
  "texas",
  "wheaties",
])

const IRREGULAR: Record<string, string> = {
  // -ves
  calves: "calf",
  halves: "half",
  hooves: "hoof",
  knives: "knife",
  leaves: "leaf",
  loaves: "loaf",
  scarves: "scarf",
  shelves: "shelf",
  wolves: "wolf",
  // -ies where the singular ends in "ie" (or "i")
  birdies: "birdie",
  brownies: "brownie",
  calories: "calorie",
  chilies: "chili",
  chillies: "chilli",
  cookies: "cookie",
  cuties: "cutie",
  hoagies: "hoagie",
  pierogies: "pierogi",
  pies: "pie",
  rotisseries: "rotisserie",
  smoothies: "smoothie",
  ties: "tie",
  twinkies: "twinkie",
  veggies: "veggie",
  zombies: "zombie",
  // -oes where the singular ends in "oe"
  aloes: "aloe",
  floes: "floe",
  joes: "joe",
  roes: "roe",
  shoes: "shoe",
  sloes: "sloe",
  toes: "toe",
  // -ches where the singular ends in "che"
  brioches: "brioche",
  caches: "cache",
  cloches: "cloche",
  ganaches: "ganache",
  maches: "mache",
  niches: "niche",
  quiches: "quiche",
  // other
  geese: "goose",
  saucisses: "saucisse",
}

/** One word, singular: "tomatoes" → "tomato", "berries" → "berry", "leaves" → "leaf", "hummus" → "hummus". */
export function singularizeWord(word: string): string {
  if (word.length <= 3 || !word.endsWith("s")) return word
  if (INVARIANT.has(word)) return word
  const irregular = IRREGULAR[word]
  if (irregular) return irregular
  if (word.endsWith("ss") || word.endsWith("us")) return word
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"
  if (word.endsWith("oes")) return word.slice(0, -2)
  if (/(?:ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2)
  return word.slice(0, -1)
}

/** Descriptive words that don't change what the ingredient is. */
const FILLER = new Set([
  "chopped",
  "coarsely",
  "diced",
  "finely",
  "fresh",
  "freshly",
  "large",
  "medium",
  "minced",
  "organic",
  "raw",
  "ripe",
  "roughly",
  "sliced",
  "small",
  "thinly",
])

/**
 * Filler word + next word (singular) that name a different product, so the filler stays:
 * "fresh oregano" (produce) isn't "oregano" (a dried spice), "diced tomatoes" are canned.
 */
const KEEP_PAIRS = new Set([
  "diced tomato",
  "fresh anchovy",
  "fresh bay",
  "fresh cayenne",
  "fresh coriander",
  "fresh lavender",
  "fresh marjoram",
  "fresh mozzarella",
  "fresh oregano",
  "fresh pasta",
  "fresh pea",
  "fresh rosemary",
  "fresh sage",
  "fresh sardine",
  "fresh savory",
  "fresh tarragon",
  "fresh thyme",
  "fresh tuna",
  "fresh turmeric",
  "fresh yeast",
  "medium grain",
  "medium roast",
  "raw sugar",
  "sliced almond",
  "sliced turkey",
])

/**
 * Plurals that name something else than their singular when they're the whole name: "peppers" are
 * bell peppers, "pepper" is black pepper. In longer names they're singular as usual ("red peppers").
 */
const LONE_PLURALS = new Set(["peppers"])

/** "whole" stays before these ("whole milk", "whole wheat flour", "whole chicken"); elsewhere it's filler. */
const WHOLE_KEEPS = new Set([
  "bean",
  "chicken",
  "duck",
  "fish",
  "food",
  "goose",
  "grain",
  "hog",
  "kernel",
  "milk",
  "rabbit",
  "turkey",
  "wheat",
])

function isFiller(word: string, next: string | undefined): boolean {
  if (next === undefined) return false
  const nextSingular = singularizeWord(next)
  if (word === "whole") return !WHOLE_KEEPS.has(nextSingular)
  if (word === "extra") return nextSingular === "large" || nextSingular === "small"
  return FILLER.has(word) && !KEEP_PAIRS.has(`${word} ${nextSingular}`)
}

/** Folded words, each singular; nothing dropped. "Fresh Tomatoes" → ["fresh", "tomato"]. */
export function ingredientWords(name: string): string[] {
  const folded = foldText(name)
  return folded ? folded.split(" ").map(singularizeWord) : []
}

/**
 * Stable matching key: folded, filler words dropped (fresh, organic, large/medium/small, ripe, raw,
 * chopped/diced/sliced/minced, "whole" unless it matters), every word singular, at most 80 characters.
 * "Fresh Tomatoes" → "tomato", "2% Milk" → "2 percent milk", "Whole Milk" → "whole milk".
 * One exception: "peppers" on its own stays plural (bell peppers; "pepper" is black pepper).
 */
export function normalizeIngredientName(name: string): string {
  const words = foldText(name).split(" ")
  const kept: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!word) continue
    // The last word is always the thing itself ("small", "raw" on their own stay).
    if (isFiller(word, words[i + 1])) continue
    kept.push(word)
  }
  if (kept.length === 1 && LONE_PLURALS.has(kept[0])) return kept[0]
  return kept.map(singularizeWord).join(" ").slice(0, MAX_KEY_LENGTH).trimEnd()
}
