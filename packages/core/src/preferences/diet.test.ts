import { describe, expect, it } from "vitest"

import { conflicts, spoonacularDiet } from "./diet"

const veg = { diet: "vegetarian", allergies: [] } as const
const vegan = { diet: "vegan", allergies: [] } as const
const pesc = { diet: "pescatarian", allergies: [] } as const

describe("conflicts", () => {
  it("passes everything with no restrictions", () => {
    expect(conflicts(["chicken thighs", "peanut butter"], { diet: "none", allergies: [] })).toBe(false)
  })

  it.each([["chicken breast"], ["Beef mince"], ["bacon"], ["chicken stock"], ["Sausages"], ["lamb chops"], ["anchovies"], ["king prawns"]])(
    "a vegetarian avoids %s",
    (name) => expect(conflicts([name], veg)).toBe(true),
  )

  it.each([["kidney beans"], ["eggplant"], ["beef tomato"], ["butternut squash"], ["vegetable stock"], ["halloumi"]])(
    "a vegetarian can have %s",
    (name) => expect(conflicts([name], veg)).toBe(false),
  )

  it("pescatarians eat fish but not meat", () => {
    expect(conflicts(["salmon fillet", "prawns"], pesc)).toBe(false)
    expect(conflicts(["pork belly"], pesc)).toBe(true)
  })

  it("vegans also skip dairy, eggs and honey, but not plant milks", () => {
    expect(conflicts(["butter"], vegan)).toBe(true)
    expect(conflicts(["2 eggs"], vegan)).toBe(true)
    expect(conflicts(["honey"], vegan)).toBe(true)
    expect(conflicts(["coconut milk", "almond milk", "peanut butter", "cocoa butter"], vegan)).toBe(false)
  })

  it("allergies: peanuts are not tree nuts, nutmeg and coconut are neither", () => {
    const treeNut = { diet: "none", allergies: ["tree-nut"] } as const
    expect(conflicts(["walnuts"], treeNut)).toBe(true)
    expect(conflicts(["peanuts", "nutmeg", "coconut", "water chestnuts"], treeNut)).toBe(false)
    expect(conflicts(["salted peanuts"], { diet: "none", allergies: ["peanut"] })).toBe(true)
  })

  it("gluten: wheat flour and soy sauce yes, rice flour and tamari no", () => {
    const gluten = { diet: "none", allergies: ["gluten"] } as const
    expect(conflicts(["plain flour"], gluten)).toBe(true)
    expect(conflicts(["soy sauce"], gluten)).toBe(true)
    expect(conflicts(["spaghetti"], gluten)).toBe(true)
    expect(conflicts(["rice flour", "tamari", "rice noodles", "corn tortillas", "cauliflower"], gluten)).toBe(false)
  })

  it("sesame, soy, shellfish and fish allergies", () => {
    expect(conflicts(["tahini"], { diet: "none", allergies: ["sesame"] })).toBe(true)
    expect(conflicts(["firm tofu"], { diet: "none", allergies: ["soy"] })).toBe(true)
    expect(conflicts(["mussels"], { diet: "none", allergies: ["shellfish"] })).toBe(true)
    expect(conflicts(["fish sauce"], { diet: "none", allergies: ["fish"] })).toBe(true)
    expect(conflicts(["Worcestershire sauce"], { diet: "none", allergies: ["fish"] })).toBe(true)
  })

  it("dairy: cream cheese yes, cream of tartar no", () => {
    const dairy = { diet: "none", allergies: ["dairy"] } as const
    expect(conflicts(["cream cheese"], dairy)).toBe(true)
    expect(conflicts(["Parmigiano-Reggiano"], dairy)).toBe(true)
    expect(conflicts(["cream of tartar"], dairy)).toBe(false)
  })
})

describe("spoonacularDiet", () => {
  it("maps our values to Spoonacular's", () => {
    expect(spoonacularDiet({ diet: "pescatarian", allergies: ["fish", "tree-nut", "dairy"] })).toEqual({
      diet: "pescetarian",
      intolerances: ["dairy", "seafood", "tree nut"],
    })
    expect(spoonacularDiet({ diet: "none", allergies: [] })).toEqual({ diet: null, intolerances: [] })
  })
})
