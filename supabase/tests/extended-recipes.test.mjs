import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("extended recipes", () => {
  let t, alex, maple, frogLegs, omelette, ownStew

  const asServer = async (fn) => {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  const importMeal = (sourceId, title, names, extended) =>
    asServer(async () => {
      const [{ id }] = await t.q(
        `insert into public.recipes (source, source_id, title, meal_types, extended)
         values ('themealdb', $1, $2, '{main course}', $3) returning id`,
        [sourceId, title, extended],
      )
      for (const [i, name] of names.entries()) {
        await t.q(
          `insert into public.recipe_ingredients (recipe_id, position, original, name, name_key)
           values ($1, $2, $3, $3, $3)`,
          [id, i, name],
        )
      }
      return id
    })

  /** Titles match_local_recipes returns for a pantry of `keys`. */
  const titles = (keys, { extended, q = null } = {}) =>
    t.as(alex, async () => {
      const args = [maple, [], keys, [], [], null, null, q, 3, 200]
      const sql =
        extended === undefined
          ? "select r.title from public.match_local_recipes($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) m join public.recipes r on r.id = m.recipe_id order by 1"
          : "select r.title from public.match_local_recipes($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) m join public.recipes r on r.id = m.recipe_id order by 1"
      return (await t.q(sql, extended === undefined ? args : [...args, extended])).map((row) => row.title)
    })

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    frogLegs = await importMeal("990001", "Frog Legs in Garlic Butter", ["frog legs", "garlic", "butter"], true)
    omelette = await importMeal("990002", "French Omelette", ["egg", "butter"], false)
    ownStew = await t.as(alex, async () =>
      (
        await t.q("select public.save_household_recipe($1, null, $2, $3) as id", [
          maple,
          JSON.stringify({ title: "Our Garlic Stew" }),
          JSON.stringify([{ original: "garlic", name: "garlic", name_key: "garlic" }]),
        ])
      )[0].id,
    )
  })

  test("everyday matching leaves extended recipes out", async () => {
    assert.deepEqual(await titles(["garlic", "butter", "egg"]), ["French Omelette", "Our Garlic Stew"])
    assert.deepEqual(await titles(["garlic", "butter", "egg"], { extended: false }), ["French Omelette", "Our Garlic Stew"])
  })

  test("Extended search includes them", async () => {
    assert.deepEqual(await titles(["garlic", "butter", "egg"], { extended: true }), [
      "French Omelette",
      "Frog Legs in Garlic Butter",
      "Our Garlic Stew",
    ])
  })

  test("a title search doesn't bring them back on its own", async () => {
    assert.deepEqual(await titles([], { q: "frog" }), [])
    assert.deepEqual(await titles([], { q: "frog", extended: true }), ["Frog Legs in Garlic Butter"])
  })

  test("extended recipes still open directly (saved links, recipe pages)", async () => {
    const rows = await t.as(alex, () => t.q("select title from public.recipes where id = $1", [frogLegs]))
    assert.deepEqual(rows, [{ title: "Frog Legs in Garlic Butter" }])
  })

  test("households can't flag their own recipes or unflag the library", async () => {
    await t.as(alex, async () => {
      await assertRejects(() => t.q("update public.recipes set extended = true where id = $1", [ownStew]), /permission denied/)
      await assertRejects(() => t.q("update public.recipes set extended = false where id = $1", [frogLegs]), /permission denied/)
    })
    const [{ extended }] = await t.q("select extended from public.recipes where id = $1", [omelette])
    assert.equal(extended, false)
  })

  test("new recipes default to everyday", async () => {
    const [{ extended }] = await t.q("select extended from public.recipes where id = $1", [ownStew])
    assert.equal(extended, false)
  })
})
