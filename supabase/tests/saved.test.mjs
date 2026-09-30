import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("saved recipes and shopping trips", () => {
  let t, alex, blair, casey, maple, caseyHome

  const save = (user, household, recipeId, title) =>
    t.as(user, () =>
      t.q(
        "insert into public.saved_recipes (household_id, recipe_id, title) values ($1, $2, $3) on conflict do nothing",
        [household, recipeId, title],
      ),
    )
  const saved = (user, household) =>
    t.as(user, () =>
      t.q("select recipe_id, title, saved_by from public.saved_recipes where household_id = $1 order by recipe_id", [household]),
    )
  const log = (household) =>
    t.q(
      "select action, item_name, quantity::float8 as quantity, actor_id, batch_id from public.activity_log where household_id = $1 order by id",
      [household],
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
  })

  test("members save for the whole household, stamped with who saved it", async () => {
    await save(alex, maple, 715538, "Chicken Tikka Masala")
    await save(blair, maple, 715538, "Chicken Tikka Masala") // already saved: no-op
    await save(blair, maple, 649036, "Korean Candy Chicken")
    assert.deepEqual(await saved(alex, maple), [
      { recipe_id: 649036, title: "Korean Candy Chicken", saved_by: blair },
      { recipe_id: 715538, title: "Chicken Tikka Masala", saved_by: alex },
    ])
  })

  test("saved_by can't be forged", async () => {
    await t.as(alex, () =>
      assertRejects(
        () =>
          t.q("insert into public.saved_recipes (household_id, recipe_id, title, saved_by) values ($1, 1, 'X', $2)", [maple, blair]),
        /permission denied/,
      ),
    )
  })

  test("other households can't see, save or unsave", async () => {
    assert.deepEqual(await saved(casey, maple), [])
    await t.as(casey, () => assertRejects(() => save(casey, maple, 1, "Nope"), /row-level security/))
    await t.as(casey, () => t.q("delete from public.saved_recipes where household_id = $1", [maple]))
    assert.equal((await saved(alex, maple)).length, 2)
    assert.equal((await saved(casey, caseyHome)).length, 0)
  })

  test("members unsave", async () => {
    await t.as(blair, () => t.q("delete from public.saved_recipes where household_id = $1 and recipe_id = 715538", [maple]))
    assert.deepEqual((await saved(alex, maple)).map((r) => r.recipe_id), [649036])
  })

  test("a shopping trip is logged as 'shopped', one batch, including untracked items", async () => {
    const [eggs, milk] = await t.as(alex, async () =>
      (
        await t.q("select * from public.add_pantry_items($1, $2)", [
          maple,
          JSON.stringify([
            { name: "eggs", quantity: 2, unit: "count", category: "dairy" },
            { name: "milk", quantity: null, unit: "count", category: "dairy" },
          ]),
        ])
      ).map((r) => r.add_pantry_items),
    )
    const listIds = await t.as(alex, async () =>
      (
        await t.q("select * from public.add_to_shopping_list($1, $2)", [
          maple,
          JSON.stringify([
            { name: "eggs", quantity: 12, unit: null, category: "dairy" },
            { name: "milk", quantity: null, unit: null, category: "dairy" },
            { name: "rice", quantity: 2, unit: "lb", category: "grains" },
          ]),
        ])
      ).map((r) => r.add_to_shopping_list),
    )

    const before = (await log(maple)).length
    await t.as(blair, () =>
      t.q("select * from public.complete_shopping_trip($1, $2::uuid[], $3)", [
        maple,
        listIds,
        JSON.stringify([
          { merge_into: eggs, quantity: 12 },
          { merge_into: milk, quantity: null },
          { name: "rice", quantity: 2, unit: "lb", category: "grains" },
        ]),
      ]),
    )
    const rows = (await log(maple)).slice(before)
    assert.deepEqual(
      rows.map((r) => [r.action, r.item_name, r.quantity, r.actor_id]),
      [
        ["shopped", "eggs", 12, blair],
        ["shopped", "milk", null, blair],
        ["shopped", "rice", 2, blair],
      ],
    )
    assert.equal(new Set(rows.map((r) => r.batch_id)).size, 1, "one trip = one batch")

    // Outside a trip, adding is still 'added'/'restocked'.
    await t.as(alex, () =>
      t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ merge_into: eggs, quantity: 1 }])]),
    )
    assert.equal((await log(maple)).at(-1).action, "restocked")
  })

  test("clearing the list without adding logs nothing", async () => {
    const [id] = await t.as(alex, async () =>
      (
        await t.q("select * from public.add_to_shopping_list($1, $2)", [
          maple,
          JSON.stringify([{ name: "capers", quantity: null, unit: null, category: "other" }]),
        ])
      ).map((r) => r.add_to_shopping_list),
    )
    const before = (await log(maple)).length
    await t.as(alex, () => t.q("select * from public.complete_shopping_trip($1, $2::uuid[], '[]')", [maple, [id]]))
    assert.equal((await log(maple)).length, before)
  })
})
