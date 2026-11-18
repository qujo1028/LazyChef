// Vetted ingredient swaps. The AI never invents a substitute: it can only choose among the
// options listed here, and a swap is only valid if it covers the role the ingredient plays in
// the recipe. Pure module. Anything not listed (steak, chicken, flour as structure…) has no
// swap: that is the point.
import { findIngredient, normalizeIngredientName } from "./catalog"

export const ROLES = [
  "binder",
  "leavening",
  "fat",
  "acid",
  "sweetener",
  "liquid",
  "creaminess",
  "thickener",
  "flavor",
  "structure",
] as const
export type Role = (typeof ROLES)[number]

export const ALLERGENS = ["nuts", "dairy", "gluten", "egg"] as const
export type Allergen = (typeof ALLERGENS)[number]

export type SubOption = {
  /** Stable id (what the AI picks). */
  id: string
  /** What to buy or grab; also matched against the pantry. */
  name: string
  /** How much to use, in words. */
  ratio: string
  /** Roles this swap can stand in for. */
  covers: readonly Role[]
  /** One short line on what changes. */
  note: string
  allergens?: readonly Allergen[]
}

export type SubEntry = {
  /** Roles the ingredient can play; the recipe decides which one applies. */
  roles: readonly Role[]
  options: readonly SubOption[]
}

function o(id: string, name: string, ratio: string, covers: Role[], note: string, allergens: Allergen[] = []): SubOption {
  return { id, name, ratio, covers, note, allergens }
}

const RAW: Record<string, SubEntry> = {
  egg: {
    roles: ["binder", "leavening"],
    options: [
      o("applesauce", "applesauce", "¼ cup per egg", ["binder"], "Denser and a little sweeter. Best in muffins, cakes and quick breads."),
      o("banana", "banana", "¼ cup mashed per egg", ["binder"], "Adds banana flavor. Fine in pancakes and sweet bakes."),
      o("flax-egg", "ground flaxseed", "1 tbsp + 3 tbsp water per egg, rest 5 min", ["binder"], "Nutty and slightly dense. Works in cookies, burgers and muffins."),
      o("yogurt", "plain yogurt", "¼ cup per egg", ["binder"], "Keeps bakes moist and tender.", ["dairy"]),
      o("aquafaba", "chickpea liquid (aquafaba)", "3 tbsp per egg", ["binder", "leavening"], "Whips and binds. Good in meringues, cakes and brownies."),
    ],
  },
  butter: {
    roles: ["fat"],
    options: [
      o("olive-oil", "olive oil", "¾ the amount", ["fat"], "Savory flavor. Great for sautéing and roasting, odd in sweet baking."),
      o("coconut-oil", "coconut oil", "1:1", ["fat"], "Solid like butter, with a hint of coconut."),
      o("vegetable-oil", "vegetable oil", "¾ the amount", ["fat"], "Neutral; bakes come out moister but less rich."),
      o("margarine", "margarine", "1:1", ["fat"], "Closest in texture. Check the label if avoiding dairy."),
      o("ghee", "ghee", "1:1", ["fat"], "Nuttier. Takes high heat well.", ["dairy"]),
    ],
  },
  milk: {
    roles: ["liquid", "creaminess"],
    options: [
      o("oat-milk", "oat milk", "1:1", ["liquid", "creaminess"], "Mild and creamy; good in both baking and sauces."),
      o("soy-milk", "soy milk", "1:1", ["liquid", "creaminess"], "Closest in protein; works almost everywhere."),
      o("almond-milk", "almond milk", "1:1", ["liquid"], "Thinner and lightly nutty.", ["nuts"]),
      o("evaporated-milk", "evaporated milk + water", "½ cup + ½ cup water per cup", ["liquid", "creaminess"], "Richer and slightly caramelized.", ["dairy"]),
      o("water", "water", "1:1", ["liquid"], "Fine for pancakes and batters, but less rich."),
    ],
  },
  buttermilk: {
    roles: ["acid", "liquid"],
    options: [
      o("milk-lemon", "milk + lemon juice", "1 tbsp lemon juice + milk to 1 cup, rest 5 min", ["acid", "liquid"], "Nearly identical in baking.", ["dairy"]),
      o("milk-vinegar", "milk + white vinegar", "1 tbsp vinegar + milk to 1 cup, rest 5 min", ["acid", "liquid"], "Same effect; no lemon flavor.", ["dairy"]),
      o("yogurt-thinned", "plain yogurt + milk", "¾ cup yogurt + ¼ cup milk", ["acid", "liquid"], "Tangy and thick; keeps bakes moist.", ["dairy"]),
    ],
  },
  "heavy cream": {
    roles: ["creaminess", "fat", "liquid"],
    options: [
      o("coconut-cream", "coconut cream", "1:1", ["creaminess", "fat", "liquid"], "Rich with a coconut taste. Whips when chilled."),
      o("evaporated-milk", "evaporated milk", "1:1", ["creaminess", "liquid"], "Lighter; won't whip. Fine in soups and sauces.", ["dairy"]),
      o("milk-butter", "milk + butter", "¾ cup milk + ¼ cup melted butter per cup", ["creaminess", "fat", "liquid"], "Good in cooking; won't whip.", ["dairy"]),
      o("cashew-cream", "cashews, blended", "1:1 (soak, blend with water)", ["creaminess", "fat"], "Neutral and silky in sauces and soups.", ["nuts"]),
    ],
  },
  "sour cream": {
    roles: ["creaminess", "acid"],
    options: [
      o("greek-yogurt", "greek yogurt", "1:1", ["creaminess", "acid"], "Tangier and a bit lighter.", ["dairy"]),
      o("plain-yogurt", "plain yogurt", "1:1", ["creaminess", "acid"], "Thinner; fine in dips and baking.", ["dairy"]),
      o("creme-fraiche", "crème fraîche", "1:1", ["creaminess", "acid"], "Richer, milder; stands up to heat.", ["dairy"]),
    ],
  },
  yogurt: {
    roles: ["creaminess", "acid"],
    options: [
      o("sour-cream", "sour cream", "1:1", ["creaminess", "acid"], "Richer; thin with a splash of milk if needed.", ["dairy"]),
      o("greek-yogurt", "greek yogurt", "1:1", ["creaminess", "acid"], "Thicker and tangier.", ["dairy"]),
    ],
  },
  mayonnaise: {
    roles: ["creaminess", "fat"],
    options: [
      o("greek-yogurt", "greek yogurt", "1:1", ["creaminess"], "Tangier and lighter. Good in salads and dressings.", ["dairy"]),
      o("sour-cream", "sour cream", "1:1", ["creaminess"], "Richer and tangy.", ["dairy"]),
    ],
  },
  "cream cheese": {
    roles: ["creaminess"],
    options: [
      o("mascarpone", "mascarpone", "1:1", ["creaminess"], "Richer and sweeter.", ["dairy"]),
      o("ricotta", "ricotta", "1:1", ["creaminess"], "Softer and grainier; drain it first.", ["dairy"]),
    ],
  },
  "white sugar": {
    roles: ["sweetener"],
    options: [
      o("brown-sugar", "brown sugar", "1:1", ["sweetener"], "Moister, with caramel notes."),
      o("honey", "honey", "¾ the amount", ["sweetener"], "Reduce other liquid by about ¼; bakes brown faster."),
      o("maple-syrup", "maple syrup", "¾ the amount", ["sweetener"], "Reduce other liquid by about 3 tbsp per cup."),
      o("coconut-sugar", "coconut sugar", "1:1", ["sweetener"], "Slightly caramel; a little less sweet."),
    ],
  },
  "brown sugar": {
    roles: ["sweetener"],
    options: [
      o("white-sugar-molasses", "white sugar + molasses", "1 cup sugar + 1 tbsp molasses", ["sweetener"], "That is how brown sugar is made."),
      o("white-sugar", "white sugar", "1:1", ["sweetener"], "Crisper and less caramel flavor."),
      o("coconut-sugar", "coconut sugar", "1:1", ["sweetener"], "Close in color and flavor."),
    ],
  },
  honey: {
    roles: ["sweetener"],
    options: [
      o("maple-syrup", "maple syrup", "1:1", ["sweetener"], "Thinner, with a maple taste."),
      o("agave", "agave syrup", "1:1", ["sweetener"], "Milder and thinner."),
    ],
  },
  "maple syrup": {
    roles: ["sweetener"],
    options: [
      o("honey", "honey", "1:1", ["sweetener"], "Thicker, floral instead of maple."),
      o("agave", "agave syrup", "1:1", ["sweetener"], "Neutral and thin."),
    ],
  },
  "baking powder": {
    roles: ["leavening"],
    options: [
      o("soda-cream-tartar", "baking soda + cream of tartar", "¼ tsp soda + ½ tsp cream of tartar per tsp", ["leavening"], "Same lift; use right away."),
      o("soda-lemon", "baking soda + lemon juice", "¼ tsp soda + ½ tsp lemon juice per tsp", ["leavening"], "Works if the batter has no other acid."),
    ],
  },
  "baking soda": {
    roles: ["leavening"],
    options: [o("baking-powder", "baking powder", "3x the amount", ["leavening"], "Can taste slightly salty or metallic in large amounts.")],
  },
  "lemon juice": {
    roles: ["acid"],
    options: [
      o("lime-juice", "lime juice", "1:1", ["acid"], "Slightly sharper; a different citrus note."),
      o("white-wine-vinegar", "white wine vinegar", "½ the amount", ["acid"], "Sharp, no citrus flavor."),
      o("apple-cider-vinegar", "apple cider vinegar", "½ the amount", ["acid"], "Fruity, sharp."),
    ],
  },
  "lime juice": {
    roles: ["acid"],
    options: [
      o("lemon-juice", "lemon juice", "1:1", ["acid"], "Slightly milder and sweeter."),
      o("white-wine-vinegar", "white wine vinegar", "½ the amount", ["acid"], "Sharp, no citrus flavor."),
    ],
  },
  "apple cider vinegar": {
    roles: ["acid"],
    options: [
      o("white-wine-vinegar", "white wine vinegar", "1:1", ["acid"], "Cleaner, less fruity."),
      o("rice-vinegar", "rice vinegar", "1:1", ["acid"], "Milder and a touch sweet."),
      o("lemon-juice", "lemon juice", "1:1", ["acid"], "Brighter, citrusy."),
    ],
  },
  "white wine vinegar": {
    roles: ["acid"],
    options: [
      o("apple-cider-vinegar", "apple cider vinegar", "1:1", ["acid"], "Fruitier."),
      o("rice-vinegar", "rice vinegar", "1:1", ["acid"], "Milder and a touch sweet."),
      o("lemon-juice", "lemon juice", "1:1", ["acid"], "Brighter, citrusy."),
    ],
  },
  cornstarch: {
    roles: ["thickener"],
    options: [
      o("flour", "all-purpose flour", "2 tbsp per tbsp", ["thickener"], "Cloudier sauce; cook it a couple of minutes longer.", ["gluten"]),
      o("arrowroot", "arrowroot", "1:1", ["thickener"], "Glossy; don't boil for long."),
      o("potato-starch", "potato starch", "1:1", ["thickener"], "Clear and glossy; add near the end."),
    ],
  },
  "all purpose flour": {
    // As structure (bread, cake) nothing here is a safe swap; as a thickener, a starch is.
    roles: ["structure", "thickener"],
    options: [
      o("cornstarch", "cornstarch", "½ the amount", ["thickener"], "Clearer sauce with twice the power of flour."),
      o("arrowroot", "arrowroot", "½ the amount", ["thickener"], "Glossy; add near the end."),
    ],
  },
  "soy sauce": {
    roles: ["flavor"],
    options: [
      o("tamari", "tamari", "1:1", ["flavor"], "Slightly richer; usually gluten-free."),
      o("coconut-aminos", "coconut aminos", "1:1", ["flavor"], "Sweeter and less salty; add a pinch of salt."),
    ],
  },
  "chicken broth": {
    roles: ["liquid", "flavor"],
    options: [
      o("vegetable-broth", "vegetable broth", "1:1", ["liquid", "flavor"], "Lighter flavor."),
      o("water-bouillon", "water + bouillon", "1 cube per cup of water", ["liquid", "flavor"], "Saltier; taste before adding more salt."),
    ],
  },
  "vegetable broth": {
    roles: ["liquid", "flavor"],
    options: [
      o("chicken-broth", "chicken broth", "1:1", ["liquid", "flavor"], "Meatier; not vegetarian."),
      o("water-bouillon", "water + bouillon", "1 cube per cup of water", ["liquid", "flavor"], "Saltier; taste before adding more salt."),
    ],
  },
  garlic: {
    roles: ["flavor"],
    options: [
      o("garlic-powder", "garlic powder", "⅛ tsp per clove", ["flavor"], "Milder and less sharp; add with the other seasonings."),
      o("shallot", "shallot", "1 small per 2 cloves", ["flavor"], "Sweeter, softer allium flavor."),
    ],
  },
  onion: {
    roles: ["flavor"],
    options: [
      o("shallot", "shallot", "3 small per medium onion", ["flavor"], "Milder and sweeter."),
      o("green-onion", "green onion", "1 bunch per medium onion", ["flavor"], "Fresher, lighter; add later in cooking."),
      o("onion-powder", "onion powder", "1 tbsp per medium onion", ["flavor"], "Flavor only; no texture."),
    ],
  },
  "tomato paste": {
    roles: ["flavor", "thickener"],
    options: [o("tomato-sauce", "tomato sauce", "3 tbsp per tbsp", ["flavor"], "Thinner; simmer a bit longer to reduce.")],
  },
  breadcrumb: {
    roles: ["binder", "structure"],
    options: [
      o("panko", "panko", "1:1", ["binder", "structure"], "Lighter and crunchier."),
      o("rolled-oats", "rolled oats", "1:1", ["binder"], "Good in meatballs and burgers; no crunch.", []),
      o("crushed-crackers", "crushed crackers", "1:1", ["binder", "structure"], "Saltier and richer.", ["gluten"]),
    ],
  },
  parmesan: {
    roles: ["flavor"],
    options: [
      o("pecorino", "pecorino romano", "1:1", ["flavor"], "Sharper and saltier.", ["dairy"]),
      o("nutritional-yeast", "nutritional yeast", "½ the amount", ["flavor"], "Cheesy and savory, dairy-free."),
    ],
  },
  "vanilla extract": {
    roles: ["flavor"],
    options: [
      o("maple-syrup", "maple syrup", "1:1", ["flavor"], "Warm sweetness; add slightly less other sugar."),
      o("almond-extract", "almond extract", "½ the amount", ["flavor"], "Strong marzipan note.", ["nuts"]),
    ],
  },
}

/** Words that mean the ingredient is the point of the dish; swapping it makes a different recipe. */
const MAIN_WORDS = new Set([
  "steak", "beef", "chicken", "pork", "lamb", "turkey", "duck", "veal", "bacon", "ham", "sausage", "salmon", "tuna", "cod",
  "shrimp", "fish", "tofu", "ribeye", "sirloin", "brisket", "rib",
])

const TABLE = new Map<string, SubEntry>(Object.entries(RAW).map(([name, entry]) => [normalizeIngredientName(name), entry]))

// Other names for the same thing. Not a suffix match: "peanut butter" must never become "butter".
const ALIASES: Record<string, string> = {
  "unsalted butter": "butter",
  "salted butter": "butter",
  "whole milk": "milk",
  "skim milk": "milk",
  "2% milk": "milk",
  sugar: "white sugar",
  "granulated sugar": "white sugar",
  flour: "all purpose flour",
  "plain flour": "all purpose flour",
  "all-purpose flour": "all purpose flour",
  "whipping cream": "heavy cream",
  "heavy whipping cream": "heavy cream",
  "greek yogurt": "yogurt",
  "plain yogurt": "yogurt",
  "bread crumbs": "breadcrumb",
  "parmesan cheese": "parmesan",
  "lemon juice": "lemon juice",
}
for (const [alias, target] of Object.entries(ALIASES)) {
  const entry = TABLE.get(normalizeIngredientName(target))
  if (entry && !TABLE.has(normalizeIngredientName(alias))) TABLE.set(normalizeIngredientName(alias), entry)
}

/** Lines like "beef stock" or "taco seasoning" contain a protein word but aren't the protein. */
const NOT_MAIN_WORDS = new Set(["broth", "stock", "bouillon", "seasoning", "sauce", "juice", "powder", "flavor", "extract", "paste", "oil", "fat", "drippings"])

const GENERIC_WORDS = new Set([...NOT_MAIN_WORDS, "vinegar", "baking", "white", "brown", "all", "purpose", "heavy", "plain"])
const EGG_DISHES = ["omelette", "omelet", "frittata", "scrambled", "quiche", "deviled", "poached"]

/**
 * True when the recipe is named for this ingredient ("egg" in "Egg Fried Rice", "butter" in
 * "Butter Chicken", any egg dish word for egg). Conservative on purpose: refusing is the safe answer.
 */
export function namedInTitle(key: string, title: string): boolean {
  const text = title.toLowerCase()
  const words = key.split(" ").filter((word) => !GENERIC_WORDS.has(word))
  const word = words[words.length - 1]
  if (word && new RegExp(`\\b${word}(?:e?s)?\\b`).test(text)) return true
  if (key === "egg") return EGG_DISHES.some((dish) => text.includes(dish))
  return false
}

export type SubstitutionLookup =
  | { kind: "options"; key: string; entry: SubEntry }
  | { kind: "main" }
  | { kind: "none" }

/** The vetted entry for an ingredient name, or why there isn't one. */
export function lookupSubstitutions(name: string): SubstitutionLookup {
  const key = normalizeIngredientName(name)
  if (!key) return { kind: "none" }
  const direct = TABLE.get(key)
  if (direct) return { kind: "options", key, entry: direct }
  const entry = findIngredient(name)
  if (entry) {
    const viaCatalog = TABLE.get(normalizeIngredientName(entry.name))
    if (viaCatalog) return { kind: "options", key: normalizeIngredientName(entry.name), entry: viaCatalog }
  }
  const words = key.split(" ")
  if (words.some((word) => NOT_MAIN_WORDS.has(word))) return { kind: "none" }
  if (words.some((word) => MAIN_WORDS.has(word)) || entry?.category === "meat" || entry?.category === "seafood") {
    return { kind: "main" }
  }
  return { kind: "none" }
}
