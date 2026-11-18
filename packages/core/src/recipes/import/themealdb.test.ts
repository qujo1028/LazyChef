import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { convertMeals, httpsUrl, mealDbUrl, mealsFromResponse, mealToRecipe, mealTypes, splitSteps, toIngredient } from "./themealdb"

// Real responses from TheMealDB's search.php / lookup.php, saved so the tests need no network.
const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/themealdb-search.json"), "utf8"))
const meals = mealsFromResponse(fixture)
const byTitle = (title: string) => {
  const meal = meals.find((m) => m.strMeal === title)
  if (!meal) throw new Error(`No fixture for ${title}`)
  return mealToRecipe(meal)!
}

describe("ingredient pairs", () => {
  it("reads the amount and unit with the pantry parser and matches the library", () => {
    expect(toIngredient("3 cloves", "garlic", 2)).toEqual({
      position: 2,
      original: "3 cloves garlic",
      name: "garlic",
      name_key: "garlic",
      quantity: 3,
      unit: "clove",
      ingredient_id: 11215,
      optional: false,
    })
  })

  it("understands metric, fractions and odd spellings", () => {
    expect(toIngredient("400g", "mushrooms", 0)).toMatchObject({ quantity: 400, unit: "g", name_key: "mushroom" })
    expect(toIngredient("¼ cup", "Vegetable oil", 0)).toMatchObject({ quantity: 0.25, unit: "cup", name: "vegetable oil" })
    expect(toIngredient("1 tbls", "Sunflower Oil", 0)).toMatchObject({ quantity: 1, unit: "tbsp" })
    expect(toIngredient("1 tin ", "chopped tomatoes", 0)).toMatchObject({ quantity: 1, unit: "can", name_key: "tomato" })
    expect(toIngredient("6-8 slices", "Parma ham", 0)).toMatchObject({ quantity: 6, unit: "slice" })
  })

  it("keeps the ingredient's own name even when the measure has prep words", () => {
    expect(toIngredient("5 thinly sliced", "Onion", 0)).toMatchObject({ name: "onion", quantity: 5, original: "5 thinly sliced Onion" })
    expect(toIngredient("3 tsp Dried", "fenugreek", 0)).toMatchObject({ name: "fenugreek", quantity: 3, unit: "tsp" })
  })

  it("leaves the amount empty for measures like 'Dash', 'To taste' and 'Juice of 1'", () => {
    for (const measure of ["Dash", "To taste", "sprinkling", "Chopped"]) {
      expect(toIngredient(measure, "salt", 0)).toMatchObject({ quantity: null, unit: null })
    }
    expect(toIngredient("", "Salt", 0)).toMatchObject({ original: "Salt", quantity: null })
  })

  it("marks garnishes and 'to serve' lines optional", () => {
    expect(toIngredient("to serve", "Raspberries", 0)?.optional).toBe(true)
    expect(toIngredient("Optional", "Chives", 0)?.optional).toBe(true)
    expect(toIngredient("to garnish", "Parsley", 0)?.optional).toBe(true)
    expect(toIngredient("For frying", "Vegetable Oil", 0)?.optional).toBe(false)
  })

  it("skips empty pairs and leaves unknown ingredients unmatched", () => {
    expect(toIngredient("", "", 0)).toBeNull()
    expect(toIngredient("1 cup", "   ", 0)).toBeNull()
    expect(toIngredient("750g piece", "Beef Fillet", 0)).toMatchObject({ name: "beef fillet", ingredient_id: null, quantity: 750 })
  })
})

describe("steps", () => {
  it("splits on lines and drops 'step 1' headers and numbering", () => {
    expect(splitSteps("step 1\r\nChop it.\r\n\r\nSTEP 2:\r\nCook it.\r\n3. Serve.")).toEqual(["Chop it.", "Cook it.", "Serve."])
    expect(splitSteps("1) Mix\n2) Bake")).toEqual(["Mix", "Bake"])
    expect(splitSteps(null)).toEqual([])
  })

  it("never loses text past 60 steps", () => {
    const steps = splitSteps(Array.from({ length: 70 }, (_, i) => `Do thing ${i + 1}.`).join("\n"))
    expect(steps).toHaveLength(60)
    expect(steps[59]).toContain("Do thing 60.")
    expect(steps[59]).toContain("Do thing 70.")
  })
})

describe("meal types", () => {
  it("maps TheMealDB's categories and tags to the filters' meal types", () => {
    expect(mealTypes({ strCategory: "Beef", strMeal: "Stew" })).toEqual(["main course"])
    expect(mealTypes({ strCategory: "Dessert", strTags: "Breakfast,Sweet", strMeal: "Pancakes" })).toEqual(["dessert", "breakfast"])
    expect(mealTypes({ strCategory: "Starter", strMeal: "Leek Soup" })).toEqual(["appetizer", "soup"])
    expect(mealTypes({ strCategory: "Vegetarian", strMeal: "Greek Salad" })).toEqual(["salad"])
    expect(mealTypes({ strCategory: "Side", strMeal: "Garlic Bread" })).toEqual(["side dish", "bread"])
  })
})

describe("whole meals (fixtures)", () => {
  it("turns a meal into a recipe row with every ingredient in order", () => {
    const penne = byTitle("Spicy Arrabiata Penne")
    expect(penne).toMatchObject({
      source: "themealdb",
      source_id: "52771",
      title: "Spicy Arrabiata Penne",
      cuisine: "Italian",
      meal_types: ["main course"],
      image_url: "https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg",
      source_url: null,
    })
    expect(penne.ingredients.map((line) => line.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(penne.ingredients.map((line) => line.name)).toContain("penne rigate")
    expect(penne.instructions.length).toBeGreaterThan(1)
  })

  it("keeps an ingredient listed twice as two lines", () => {
    const fritters = byTitle("Acaraje black-eyed pea fritters with shrimp filling")
    expect(fritters.ingredients.filter((line) => line.name === "garlic")).toHaveLength(2)
    expect(fritters.instructions[0]).toMatch(/^Make the filling/)
    expect(fritters.cuisine).toBe("Brazil")
  })

  it("marks the pancakes' toppings optional and files them under breakfast too", () => {
    const pancakes = byTitle("Pancakes")
    expect(pancakes.meal_types).toEqual(["dessert", "breakfast"])
    expect(pancakes.ingredients.filter((line) => line.optional).map((line) => line.name)).toEqual(["sugar", "raspberries", "blueberries"])
    expect(pancakes.source_url).toBe("https://www.bbcgoodfood.com/recipes/2907669/easy-pancakes")
  })

  it("converts every fixture, de-duplicates by id and counts what the library doesn't know", () => {
    const result = convertMeals([...meals, meals[0]])
    expect(result.recipes).toHaveLength(meals.length)
    expect(result.skipped).toEqual([])
    expect([...result.unmatched]).toEqual([["beef fillet", 1]])
    const lines = result.recipes.flatMap((recipe) => recipe.ingredients)
    expect(lines.filter((line) => line.ingredient_id !== null).length / lines.length).toBeGreaterThan(0.95)
  })

  it("skips meals with no id, title or ingredients", () => {
    const result = convertMeals([{ idMeal: "1", strMeal: "Air" }, { strMeal: "No id", strIngredient1: "salt" }])
    expect(result.recipes).toEqual([])
    expect(result.skipped).toEqual(["Air", "No id"])
  })

  it("reads empty letters and bad responses as no meals", () => {
    expect(mealsFromResponse({ meals: null })).toEqual([])
    expect(mealsFromResponse("nope")).toEqual([])
  })
})

describe("links", () => {
  it("upgrades images to https and refuses anything but http(s)", () => {
    expect(httpsUrl("http://www.themealdb.com/x.jpg", { upgrade: true })).toBe("https://www.themealdb.com/x.jpg")
    expect(httpsUrl("javascript:alert(1)")).toBeNull()
    expect(httpsUrl("")).toBeNull()
    expect(mealDbUrl("52771")).toBe("https://www.themealdb.com/meal/52771")
  })
})
