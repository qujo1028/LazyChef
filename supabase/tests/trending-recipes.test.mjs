import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("trending recipes", () => {
  let t, users, homes, eggs, lib, mine

  const importMeal = async (sourceId, title, minutes) => {
    const [{ id }] = await t.q(
      `insert into public.recipes (source, source_id, title, ready_in_minutes, instructions, image_url)
       values ('themealdb', $1, $2, $3, '{Cook it.}', $4) returning id`,
      [sourceId, title, minutes, `https://www.themealdb.com/images/media/meals/${sourceId}.jpg`],
    )
    return id
  }
  const cook = (user, household, recipeId, title = "Dinner") =>
    t.as(user, () =>
      t.q("select * from public.cook_recipe($1, $2, $3, $4, $5)", [
        household,
        null,
        title,
        JSON.stringify([{ item_id: eggs[household], amount: 1 }]),
        recipeId,
      ]),
    )
  const trending = (user, limit) =>
    t.as(user, () =>
      t.q(
        limit === undefined
          ? "select * from public.get_trending_recipes()"
          : "select * from public.get_trending_recipes($1)",
        limit === undefined ? [] : [limit],
      ),
    )

  before(async () => {
    t = await createTestDb()
    users = {}
    homes = {}
    eggs = {}
    for (const name of ["alex", "blair", "casey", "drew", "eli"]) {
      users[name] = await t.createUser(`${name}@test.dev`, { full_name: name })
      homes[name] = await t.as(users[name], async () =>
        (await t.q("select public.create_household($1) as id", [`${name} home`]))[0].id,
      )
      const [{ id }] = await t.as(users[name], () =>
        t.q("select public.add_pantry_items($1, $2) as id", [
          homes[name],
          JSON.stringify([{ name: "eggs", quantity: 1000, unit: "count", category: "dairy" }]),
        ]),
      )
      eggs[homes[name]] = id
    }
    lib = {
      tacos: await importMeal("1", "Tacos", 20),
      curry: await importMeal("2", "Curry", 40),
      soup: await importMeal("3", "Soup", 30),
      old: await importMeal("4", "Old favourite", 15),
    }
    const [{ id }] = await t.q(
      "insert into public.recipes (household_id, title, created_by) values ($1, 'Secret stew', $2) returning id",
      [homes.alex, users.alex],
    )
    mine = id
  })

  test("anon can't call it", async () => {
    await assertRejects(() => trending(null), /permission denied/)
  })

  test("a recipe needs at least 2 households", async () => {
    await cook(users.alex, homes.alex, lib.soup)
    assert.deepEqual(await trending(users.eli), [])
    await cook(users.blair, homes.blair, lib.soup)
    const rows = await trending(users.eli)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, lib.soup)
    assert.equal(rows[0].title, "Soup")
    assert.equal(rows[0].ready_in_minutes, 30)
    assert.equal(rows[0].household_count, 2)
    assert.match(rows[0].image_url, /^https:\/\//)
  })

  test("your own household never counts toward the minimum", async () => {
    // Soup: alex and blair. To alex only blair counts, so alex can't learn what blair cooked.
    assert.ok(!(await trending(users.alex)).some((r) => r.id === lib.soup))
    assert.ok(!(await trending(users.blair)).some((r) => r.id === lib.soup))
  })

  test("counts households, not cooks", async () => {
    for (let i = 0; i < 5; i += 1) await cook(users.alex, homes.alex, lib.curry)
    assert.ok(!(await trending(users.eli)).some((r) => r.id === lib.curry), "one household alone never trends")

    await cook(users.alex, homes.alex, lib.tacos)
    await cook(users.blair, homes.blair, lib.tacos)
    await cook(users.casey, homes.casey, lib.tacos)
    await cook(users.drew, homes.drew, lib.curry)

    const rows = await trending(users.eli)
    assert.deepEqual(
      rows.map((r) => [r.title, r.household_count]),
      [
        ["Tacos", 3],
        ["Curry", 2],
        ["Soup", 2],
      ],
    )
  })

  test("returns only the recipe and a count, never who cooked", async () => {
    const [row] = await trending(users.eli)
    assert.deepEqual(Object.keys(row).sort(), ["household_count", "id", "image_url", "ready_in_minutes", "title"])
  })

  test("household recipes never show up", async () => {
    // A tampered log row pointing two households at one household's own recipe.
    await cook(users.alex, homes.alex, mine)
    await t.q(
      `insert into public.activity_log (household_id, actor_id, action, item_name, batch_id, details)
       values ($1, $2, 'cooked', 'eggs', 1, jsonb_build_object('local_recipe_id', $3::text))`,
      [homes.blair, users.blair, mine],
    )
    assert.ok(!(await trending(users.eli)).some((r) => r.id === mine))
  })

  test("recipes hidden from the library never show up", async () => {
    const hiddenId = await importMeal("5", "Cut dish", 10)
    await t.q("update public.recipes set hidden = true where id = $1", [hiddenId])
    await cook(users.alex, homes.alex, hiddenId)
    await cook(users.blair, homes.blair, hiddenId)
    assert.ok(!(await trending(users.eli)).some((r) => r.id === hiddenId))
  })

  test("only the last 7 days count", async () => {
    await cook(users.alex, homes.alex, lib.old)
    await cook(users.blair, homes.blair, lib.old)
    assert.ok((await trending(users.eli)).some((r) => r.id === lib.old))
    await t.q(
      "update public.activity_log set created_at = now() - interval '8 days' where details ->> 'local_recipe_id' = $1",
      [lib.old],
    )
    assert.ok(!(await trending(users.eli)).some((r) => r.id === lib.old))
  })

  test("ignores malformed recipe ids and honours the limit", async () => {
    await t.q(
      `insert into public.activity_log (household_id, actor_id, action, item_name, batch_id, details)
       values ($1, $2, 'cooked', 'eggs', 2, '{"local_recipe_id": "not-a-uuid"}')`,
      [homes.casey, users.casey],
    )
    assert.equal((await trending(users.eli, 1)).length, 1)
    assert.equal((await trending(users.eli)).length, 3)
  })
})
