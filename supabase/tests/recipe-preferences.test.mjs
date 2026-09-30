import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("recipe preferences", () => {
  let t, alex, blair, casey, maple, caseyHome, ids

  async function asServer(fn) {
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  const meal = (sourceId, title, cuisine, types, minutes, lines) =>
    asServer(async () => {
      const [{ id }] = await t.q(
        `insert into public.recipes (source, source_id, title, cuisine, meal_types, ready_in_minutes)
         values ('themealdb', $1, $2, $3, $4, $5) returning id`,
        [sourceId, title, cuisine, types, minutes],
      )
      for (const [i, name] of lines.entries()) {
        await t.q(
          "insert into public.recipe_ingredients (recipe_id, position, original, name, name_key) values ($1, $2, $3, $3, $3)",
          [id, i, name],
        )
      }
      return id
    })

  const match = (user, household, extra = {}) =>
    t.as(user, async () =>
      (
        await t.q(
          `select recipe_id from public.match_local_recipes(
             p_household_id => $1, p_ingredient_ids => '{}', p_name_keys => $2,
             p_cuisines => $3, p_hide_types => $4, p_max_ingredients => $5,
             p_max_minutes => $6, p_keep_untimed => $7)`,
          [household, ["egg", "rice", "tomato"], extra.cuisines ?? null, extra.hide ?? [], extra.maxIngredients ?? null, extra.maxMinutes ?? null, extra.keepUntimed ?? false],
        )
      ).map((r) => r.recipe_id),
    )

  const prefs = (user, household) =>
    t.as(user, () =>
      t.q("select cuisines, hidden_meal_types, max_ingredients, max_minutes, updated_by from public.recipe_preferences where household_id = $1", [household]),
    )

  const save = (user, household, row) =>
    t.as(user, () =>
      t.q(
        `insert into public.recipe_preferences (household_id, cuisines, hidden_meal_types, max_ingredients, max_minutes)
         values ($1, $2, $3, $4, $5)
         on conflict (household_id) do update set cuisines = excluded.cuisines, hidden_meal_types = excluded.hidden_meal_types,
           max_ingredients = excluded.max_ingredients, max_minutes = excluded.max_minutes`,
        [household, row.cuisines ?? [], row.hidden ?? [], row.maxIngredients ?? null, row.maxMinutes ?? null],
      ),
    )

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)
    ids = {
      friedRice: await meal("1", "Fried Rice", "Chinese", ["main course"], null, ["rice", "egg", "soy sauce"]),
      omelette: await meal("2", "Omelette", "France", ["breakfast"], 10, ["egg", "butter"]),
      salsa: await meal("3", "Salsa", "Mexican", ["sauce"], 5, ["tomato", "onion"]),
      paella: await meal("4", "Paella", "Spanish", ["main course"], 60, ["rice", "egg", "tomato", "saffron", "chicken", "peas", "stock", "lemon"]),
    }
  })

  test("members save preferences for the household, stamped with who did it", async () => {
    await save(alex, maple, { cuisines: ["Chinese"], hidden: ["sauce", "drink"], maxIngredients: 8, maxMinutes: 30 })
    assert.deepEqual(await prefs(blair, maple), [
      { cuisines: ["Chinese"], hidden_meal_types: ["sauce", "drink"], max_ingredients: 8, max_minutes: 30, updated_by: alex },
    ])
    await save(blair, maple, { cuisines: [], hidden: ["sauce"] })
    const [row] = await prefs(alex, maple)
    assert.deepEqual([row.cuisines, row.hidden_meal_types, row.max_ingredients, row.updated_by], [[], ["sauce"], null, blair])
  })

  test("defaults hide sauces, marinades and drinks", async () => {
    await t.as(casey, () => t.q("insert into public.recipe_preferences (household_id) values ($1)", [caseyHome]))
    const [row] = await prefs(casey, caseyHome)
    assert.deepEqual(row.hidden_meal_types, ["sauce", "marinade", "beverage", "drink"])
  })

  test("other households can't see or change them, and bad values are refused", async () => {
    assert.deepEqual(await prefs(casey, maple), [])
    await assertRejects(() => save(casey, maple, { cuisines: ["Thai"] }), /row-level security/)
    await t.as(casey, () => t.q("update public.recipe_preferences set cuisines = '{Thai}' where household_id = $1", [maple]))
    assert.deepEqual((await prefs(alex, maple))[0].cuisines, [])
    await assertRejects(() => save(alex, maple, { hidden: ["brunch"] }), /check constraint/)
    await assertRejects(() => save(alex, maple, { maxIngredients: 1 }), /check constraint/)
    await assertRejects(() => save(alex, maple, { cuisines: [""] }), /check constraint/)
    await t.as(alex, () =>
      assertRejects(
        () => t.q("update public.recipe_preferences set updated_by = $1 where household_id = $2", [casey, maple]),
        /permission denied/,
      ),
    )
    await t.as(null, () => assertRejects(() => t.q("select * from public.recipe_preferences"), /permission denied/))
  })

  test("matching leaves out hidden meal types, other cuisines and long ingredient lists", async () => {
    const all = await match(alex, maple)
    assert.ok(all.includes(ids.salsa) && all.includes(ids.paella))
    assert.ok(!(await match(alex, maple, { hide: ["sauce"] })).includes(ids.salsa))
    assert.deepEqual(new Set(await match(alex, maple, { cuisines: ["Chinese", "France"] })), new Set([ids.friedRice, ids.omelette]))
    assert.ok(!(await match(alex, maple, { maxIngredients: 6 })).includes(ids.paella))
  })

  test("a quick preference keeps recipes that don't say how long; a time filter doesn't", async () => {
    const preferred = await match(alex, maple, { maxMinutes: 30, keepUntimed: true })
    assert.ok(preferred.includes(ids.friedRice), "no time listed")
    assert.ok(preferred.includes(ids.omelette))
    assert.ok(!preferred.includes(ids.paella), "60 minutes")
    const filtered = await match(alex, maple, { maxMinutes: 30 })
    assert.ok(!filtered.includes(ids.friedRice))
  })
})
