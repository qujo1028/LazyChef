import type { Allergy, Diet } from "./options"

/** What the matching needs: a diet and any allergies. */
export type DietInput = { diet: Diet; allergies: readonly Allergy[] }

// Which ingredients a diet or allergy rules out, matched on ingredient names. The library
// recipes (TheMealDB) carry no diet tags, so this is what hides a chicken curry from a
// vegetarian. It errs towards hiding: a false "conflict" costs one idea, a miss costs trust.

type Group = "meat" | "fish" | "shellfish" | "dairy" | "egg" | "honey" | "gluten" | "peanut" | "tree-nut" | "soy" | "sesame"

/** Words (whole-word, singular or plural) that mean an ingredient is in the group. */
const WORDS: Record<Group, string[]> = {
  meat: [
    "chicken", "beef", "pork", "lamb", "mutton", "bacon", "ham", "sausage", "chorizo", "pepperoni", "salami",
    "prosciutto", "pancetta", "turkey", "duck", "goose", "veal", "venison", "goat", "steak", "mince", "brisket",
    "rib", "ribs", "meatball", "oxtail", "liver", "lard", "suet", "gelatin", "gelatine", "kidney", "black pudding",
    "rabbit", "pheasant", "quail", "guanciale", "bresaola", "hot dog", "frankfurter", "bratwurst", "kielbasa", "gammon",
    "jamon", "chuck", "sirloin", "tenderloin", "short rib", "drumstick", "thigh", "wing", "bone broth", "beef stock",
    "chicken stock", "dripping", "haggis", "merguez", "andouille", "speck", "mortadella", "corned beef", "pastrami",
  ],
  fish: [
    "fish", "salmon", "tuna", "cod", "haddock", "anchovy", "anchovies", "sardine", "mackerel", "trout", "tilapia",
    "halibut", "sea bass", "bass", "snapper", "swordfish", "herring", "kipper", "pollock", "plaice", "sole", "monkfish",
    "catfish", "carp", "eel", "caviar", "roe", "bonito", "dashi", "worcestershire", "fish sauce", "kedgeree", "pilchard",
  ],
  shellfish: [
    "shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop", "squid", "calamari", "octopus",
    "crayfish", "langoustine", "cockle", "whelk", "shellfish", "seafood", "oyster sauce",
  ],
  dairy: [
    "milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "ghee", "buttermilk", "parmesan", "parmigiano",
    "mozzarella", "cheddar", "feta", "ricotta", "mascarpone", "creme fraiche", "crème fraîche", "custard",
    "ice cream", "paneer", "whey", "brie", "camembert", "gruyere", "gruyère", "gouda", "halloumi", "pecorino",
    "stilton", "emmental", "fontina", "provolone", "quark", "kefir", "condensed milk", "evaporated milk",
    "sour cream", "creme", "double cream", "single cream", "goat cheese", "cream cheese", "manchego", "labneh",
  ],
  egg: ["egg", "eggs", "yolk", "egg white", "mayonnaise", "mayo", "meringue", "aioli", "hollandaise"],
  honey: ["honey"],
  gluten: [
    "flour", "wheat", "bread", "breadcrumb", "breadcrumbs", "panko", "pasta", "spaghetti", "noodle", "noodles",
    "macaroni", "lasagne", "lasagna", "penne", "fettuccine", "linguine", "tagliatelle", "fusilli", "rigatoni", "orzo",
    "couscous", "barley", "rye", "semolina", "bulgur", "bulgar", "soy sauce", "tortilla", "pastry", "puff pastry",
    "filo", "phyllo", "cracker", "biscuit", "beer", "ale", "seitan", "udon", "ramen", "baguette", "brioche", "bun",
    "pita", "naan", "croissant", "crouton", "spelt", "farro", "malt", "gnocchi", "dumpling", "wonton", "roll",
  ],
  peanut: ["peanut", "peanuts", "peanut butter", "groundnut", "satay"],
  "tree-nut": [
    "almond", "walnut", "cashew", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut",
    "chestnut", "praline", "marzipan", "nutella", "frangipane", "nut", "nuts", "mixed nuts",
  ],
  soy: ["soy", "soya", "tofu", "tempeh", "edamame", "miso", "soy sauce", "tamari", "soybean"],
  sesame: ["sesame", "tahini", "hummus", "houmous", "halva", "gomasio"],
}

/** Names that contain a group's word but aren't in it ("coconut milk" isn't dairy). */
const EXCEPTIONS: Partial<Record<Group, string[]>> = {
  meat: ["kidney bean", "kidney beans", "chicken of the woods", "beef tomato", "beefsteak tomato", "vegetarian", "vegan", "plant-based", "meat-free"],
  fish: ["fish-free"],
  dairy: [
    "coconut milk", "coconut cream", "almond milk", "oat milk", "soy milk", "soya milk", "rice milk", "cashew milk",
    "peanut butter", "almond butter", "cashew butter", "nut butter", "cocoa butter", "apple butter", "butternut",
    "butter bean", "butter beans", "butterhead", "cream of tartar", "creamed coconut", "dairy-free", "vegan",
  ],
  egg: ["eggplant", "egg-free", "egg noodle free", "vegan mayo", "vegan mayonnaise"],
  gluten: [
    "rice flour", "corn flour", "cornflour", "almond flour", "coconut flour", "chickpea flour", "gram flour",
    "buckwheat flour", "potato flour", "tapioca flour", "gluten-free", "gluten free", "rice noodle", "rice noodles",
    "glass noodle", "glass noodles", "rice vermicelli", "corn tortilla", "corn tortillas", "tamari", "spring roll wrapper",
    "cauliflower", "egg roll",
  ],
  "tree-nut": ["nutmeg", "coconut", "butternut", "water chestnut", "water chestnuts", "doughnut", "donut", "nut-free", "peanut", "peanuts", "groundnut", "pine nut free"],
  soy: [],
}

const DIET_GROUPS: Record<Diet, Group[]> = {
  none: [],
  vegetarian: ["meat", "fish", "shellfish"],
  pescatarian: ["meat"],
  vegan: ["meat", "fish", "shellfish", "dairy", "egg", "honey"],
}

const ALLERGY_GROUPS: Record<Allergy, Group[]> = {
  dairy: ["dairy"],
  egg: ["egg"],
  gluten: ["gluten"],
  peanut: ["peanut"],
  "tree-nut": ["tree-nut"],
  fish: ["fish"],
  shellfish: ["shellfish"],
  soy: ["soy"],
  sesame: ["sesame"],
}

function clean(name: string): string {
  return ` ${name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const PATTERNS = Object.fromEntries(
  (Object.keys(WORDS) as Group[]).map((group) => {
    const words = WORDS[group].map((w) => clean(w).trim())
    const exceptions = (EXCEPTIONS[group] ?? []).map((w) => clean(w).trim())
    return [
      group,
      {
        // Whole words, allowing a plural "s"/"es".
        match: new RegExp(` (?:${words.map(escape).join("|")})(?:e?s)? `),
        except: exceptions.length ? new RegExp(` (?:${exceptions.map(escape).join("|")}) `, "g") : null,
      },
    ]
  }),
) as Record<Group, { match: RegExp; except: RegExp | null }>

function inGroup(name: string, group: Group): boolean {
  const { match, except } = PATTERNS[group]
  let text = clean(name)
  // Blank out the exceptions first, keeping the spaces around them as word breaks.
  if (except) text = text.replace(except, "  ")
  return match.test(text)
}

/** The groups this person avoids. */
function avoided(prefs: DietInput): Group[] {
  return [...new Set([...DIET_GROUPS[prefs.diet], ...prefs.allergies.flatMap((a) => ALLERGY_GROUPS[a])])]
}

/** True when any of these ingredient names breaks the person's diet or allergies. */
export function conflicts(names: readonly string[], prefs: DietInput): boolean {
  const groups = avoided(prefs)
  if (groups.length === 0) return false
  return names.some((name) => groups.some((group) => inGroup(name, group)))
}

/** Spoonacular's complexSearch `diet` and `intolerances` for these preferences. */
export function spoonacularDiet(prefs: DietInput): {
  diet: string | null
  intolerances: string[]
} {
  const diet = prefs.diet === "none" ? null : prefs.diet === "pescatarian" ? "pescetarian" : prefs.diet
  const names: Record<Allergy, string> = {
    dairy: "dairy",
    egg: "egg",
    gluten: "gluten",
    peanut: "peanut",
    "tree-nut": "tree nut",
    fish: "seafood",
    shellfish: "shellfish",
    soy: "soy",
    sesame: "sesame",
  }
  return { diet, intolerances: [...new Set(prefs.allergies.map((a) => names[a]))].sort() }
}
