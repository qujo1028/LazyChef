import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("library curation (hidden recipes)", () => {
  let t, alex, maple, smoothie, omelette

  const asServer = async (fn) => {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  const importMeal = (sourceId, title, names, hidden) =>
    asServer(async () => {
      const [{ id }] = await t.q(
        `insert into public.recipes (source, source_id, title, meal_types, hidden)
         values ('themealdb', $1, $2, '{main course}', $3) returning id`,
        [sourceId, title, hidden],
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

  const titles = (keys, { extended = false, q = null } = {}) =>
    t.as(alex, async () =>
      (
        await t.q(
          "select r.title from public.match_local_recipes($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) m join public.recipes r on r.id = m.recipe_id order by 1",
          [maple, [], keys, [], [], null, null, q, 3, 200, extended],
        )
      ).map((row) => row.title),
    )

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    smoothie = await importMeal("990101", "Banana Smoothie", ["banana", "milk"], true)
    omelette = await importMeal("990102", "Cheese Omelette", ["egg", "milk"], false)
  })

  test("matching never returns hidden recipes, even in Extended search or a title search", async () => {
    assert.deepEqual(await titles(["banana", "milk", "egg"]), ["Cheese Omelette"])
    assert.deepEqual(await titles(["banana", "milk", "egg"], { extended: true }), ["Cheese Omelette"])
    assert.deepEqual(await titles([], { q: "smoothie", extended: true }), [])
  })

  test("hidden recipes still open directly", async () => {
    const rows = await t.as(alex, () => t.q("select title from public.recipes where id = $1", [smoothie]))
    assert.deepEqual(rows, [{ title: "Banana Smoothie" }])
  })

  test("households can't hide or unhide recipes", async () => {
    await t.as(alex, async () => {
      await assertRejects(() => t.q("update public.recipes set hidden = false where id = $1", [smoothie]), /permission denied/)
      await assertRejects(() => t.q("update public.recipes set hidden = true where id = $1", [omelette]), /permission denied/)
    })
  })
})
