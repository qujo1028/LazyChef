import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { createTestDb } from "./harness.mjs"

// The app deletes an account by deleting the auth user (with the secret key), so these
// tests do the same, as the database owner.
describe("account deletion", () => {
  let t, alex, blair, casey, maple, solo, caseyHome, pancakes, milk, eggs

  const count = async (sql, params) => (await t.q(`select count(*)::int as n from ${sql}`, params))[0].n
  // Like Supabase's admin API: no signed-in user (auth.uid() is null).
  const deleteUser = async (id) => {
    await t.q("select set_config('request.jwt.claim.sub', '', false)")
    await t.q("delete from auth.users where id = $1", [id])
  }

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })

    // Maple: Alex owns it, Blair joined later. Solo: only Alex.
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    solo = await t.as(alex, async () => (await t.q("select public.create_household('Solo') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)

    await t.as(alex, async () => {
      // Pantry items, list lines, a recipe, a saved recipe and a barcode in each household.
      for (const household of [maple, solo]) {
        await t.q("select * from public.add_pantry_items($1, $2)", [
          household,
          JSON.stringify([{ name: "rice", quantity: 2, unit: "lb", category: "grains" }]),
        ])
        await t.q("select * from public.add_to_shopping_list($1, $2)", [
          household,
          JSON.stringify([
            { name: "milk", quantity: null, unit: null, category: "dairy" },
            { name: "eggs", quantity: 12, unit: "count", category: "dairy" },
          ]),
        ])
        await t.q("insert into public.saved_recipes (household_id, recipe_id, title) values ($1, 1, 'Soup')", [household])
        await t.q("insert into public.household_barcodes (household_id, code, name) values ($1, '0012345678905', 'milk')", [household])
      }
      ;[{ id: pancakes }] = await t.q("select public.save_household_recipe($1, null, $2, $3) as id", [
        maple,
        JSON.stringify({ title: "Pancakes", meal_types: ["breakfast"], instructions: ["Mix.", "Fry."] }),
        JSON.stringify([{ original: "2 eggs", name: "eggs", name_key: "eggs" }]),
      ])
      ;[{ id: milk }] = await t.q("select id from public.shopping_list_items where household_id = $1 and name = 'milk'", [maple])
      ;[{ id: eggs }] = await t.q("select id from public.shopping_list_items where household_id = $1 and name = 'eggs'", [maple])
      // Alex checks off milk (it stays in the cart, so its stamp is kept on later updates).
      await t.q("update public.shopping_list_items set checked_at = now() where id = $1", [milk])
    })
  })

  test("deleting an account removes the profile and every membership", async () => {
    const activityBefore = await count("public.activity_log where household_id = $1", [maple])
    await deleteUser(alex)

    assert.equal(await count("public.profiles where id = $1", [alex]), 0)
    assert.equal(await count("public.household_members where user_id = $1", [alex]), 0)
    // Clearing who did what isn't logged as housemates' edits.
    assert.equal(await count("public.activity_log where household_id = $1", [maple]), activityBefore)
  })

  test("a household they were alone in is deleted with everything in it", async () => {
    assert.equal(await count("public.households where id = $1", [solo]), 0)
    for (const table of ["pantry_items", "shopping_list_items", "saved_recipes", "household_barcodes", "activity_log"]) {
      assert.equal(await count(`public.${table} where household_id = $1`, [solo]), 0, table)
    }
  })

  test("a shared household stays, and the longest-standing member becomes owner", async () => {
    const members = await t.q("select user_id, role from public.household_members where household_id = $1", [maple])
    assert.deepEqual(members, [{ user_id: blair, role: "owner" }])
    // Blair can now do owner things.
    await t.as(blair, async () => {
      await t.q("select public.regenerate_invite_code($1)", [maple])
      await t.q("update public.households set name = 'Maple St' where id = $1", [maple])
    })
    assert.equal((await t.q("select name from public.households where id = $1", [maple]))[0].name, "Maple St")
  })

  test("their housemates keep the shared data, with their name taken off it", async () => {
    const [rice] = await t.q("select created_by, updated_by from public.pantry_items where household_id = $1", [maple])
    assert.deepEqual(rice, { created_by: null, updated_by: null })

    const lines = await t.q(
      "select id, added_by, checked_by, checked_at is not null as checked from public.shopping_list_items where household_id = $1",
      [maple],
    )
    assert.deepEqual(
      lines.map((l) => [l.id, l.added_by, l.checked_by, l.checked]).sort(),
      [
        [milk, null, null, true],
        [eggs, null, null, false],
      ].sort(),
    )

    const [recipe] = await t.q("select title, created_by from public.recipes where id = $1", [pancakes])
    assert.deepEqual(recipe, { title: "Pancakes", created_by: null })
    assert.equal(await count("public.recipe_ingredients where recipe_id = $1", [pancakes]), 1)

    const [saved] = await t.q("select saved_by from public.saved_recipes where household_id = $1", [maple])
    assert.equal(saved.saved_by, null)
    const [barcode] = await t.q("select saved_by from public.household_barcodes where household_id = $1", [maple])
    assert.equal(barcode.saved_by, null)

    const actors = await t.q("select distinct actor_id from public.activity_log where household_id = $1", [maple])
    assert.ok(actors.every((a) => a.actor_id !== alex))
    assert.ok(await count("public.activity_log where household_id = $1", [maple]) > 0, "the history stays")
  })

  test("stamps still hold for people whose accounts exist", async () => {
    // A checked line keeps who checked it, and a recipe keeps who made it.
    await t.as(blair, async () => {
      await t.q("update public.shopping_list_items set checked_at = now() where id = $1", [eggs])
      await t.q("update public.shopping_list_items set note = 'oat' where id = $1", [eggs])
    })
    await t.as(casey, () =>
      t.q("update public.shopping_list_items set note = 'nope' where id = $1", [eggs]), // not a member: no rows
    )
    const [line] = await t.q("select checked_by, note from public.shopping_list_items where id = $1", [eggs])
    assert.deepEqual(line, { checked_by: blair, note: "oat" })

    const blairs = await t.as(blair, async () =>
      (
        await t.q("select public.save_household_recipe($1, null, $2, $3) as id", [
          maple,
          JSON.stringify({ title: "Toast", instructions: ["Toast."] }),
          JSON.stringify([{ original: "bread", name: "bread", name_key: "bread" }]),
        ])
      )[0].id,
    )
    await t.as(blair, () => t.q("update public.recipes set title = 'Better Toast' where id = $1", [blairs]))
    const [toast] = await t.q("select title, created_by from public.recipes where id = $1", [blairs])
    assert.deepEqual(toast, { title: "Better Toast", created_by: blair })
  })

  test("other households are untouched", async () => {
    const members = await t.q("select user_id, role from public.household_members where household_id = $1", [caseyHome])
    assert.deepEqual(members, [{ user_id: casey, role: "owner" }])
  })

  test("leaving still works the same way", async () => {
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(casey, () => t.q("select public.join_household($1)", [invite_code]))
    await t.as(blair, () => t.q("select public.leave_household($1)", [maple]))
    assert.deepEqual(await t.q("select user_id, role from public.household_members where household_id = $1", [maple]), [
      { user_id: casey, role: "owner" },
    ])
    await t.as(casey, () => t.q("select public.leave_household($1)", [maple]))
    assert.equal(await count("public.households where id = $1", [maple]), 0)
  })

  test("deleting the last member's account from the dashboard deletes the household too", async () => {
    await deleteUser(casey)
    assert.equal(await count("public.households where id = $1", [caseyHome]), 0)
    await deleteUser(blair)
    assert.equal(await count("public.profiles"), 0)
    assert.equal(await count("public.households"), 0)
  })
})
