import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("shopping list", () => {
  let t, alex, blair, casey, maple, caseyHome

  const list = (household) =>
    t.q(
      "select id, name, quantity::float8 as quantity, unit, checked_at, checked_by, added_by from public.shopping_list_items where household_id = $1 order by created_at, name",
      [household],
    )
  const addToList = (user, household, items) =>
    t.as(user, async () =>
      (await t.q("select * from public.add_to_shopping_list($1, $2)", [household, JSON.stringify(items)])).map(
        (r) => r.add_to_shopping_list,
      ),
    )
  const putAway = (user, household, ids, pantryItems) =>
    t.as(user, () =>
      t.q("select * from public.complete_shopping_trip($1, $2::uuid[], $3)", [household, ids, JSON.stringify(pantryItems)]),
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

  test("members add lines, stamped with who added them", async () => {
    const ids = await addToList(alex, maple, [
      { name: " milk ", quantity: null, unit: null, category: "dairy" },
      { name: "chicken thighs", quantity: 2, unit: "lb", category: "meat", recipe_id: 715538, recipe_title: "Chicken Tikka Masala" },
    ])
    assert.equal(ids.length, 2)
    const rows = await list(maple)
    assert.deepEqual(rows.map((r) => [r.name, r.quantity, r.unit, r.added_by]), [
      ["chicken thighs", 2, "lb", alex],
      ["milk", null, null, alex],
    ])
    const [recipe] = await t.q("select recipe_id, recipe_title from public.shopping_list_items where name = 'chicken thighs'")
    assert.deepEqual(recipe, { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" })
  })

  test("adding more tops up an unchecked line, but not one already in the cart", async () => {
    const [chicken] = (await list(maple)).filter((r) => r.name === "chicken thighs")
    await addToList(blair, maple, [{ merge_into: chicken.id, quantity: 1 }])
    assert.equal((await list(maple)).find((r) => r.id === chicken.id).quantity, 3)

    await t.as(blair, () => t.q("update public.shopping_list_items set checked_at = now() where id = $1", [chicken.id]))
    await t.as(alex, () =>
      assertRejects(
        () => t.q("select * from public.add_to_shopping_list($1, $2)", [maple, JSON.stringify([{ merge_into: chicken.id, quantity: 1 }])]),
        /already checked off/,
      ),
    )
  })

  test("checking off records who and when; unchecking clears it; neither can be forged", async () => {
    const [milk] = (await list(maple)).filter((r) => r.name === "milk")
    await t.as(alex, () =>
      t.q("update public.shopping_list_items set checked_at = '2001-01-01T00:00:00Z' where id = $1", [milk.id]),
    )
    let [row] = (await list(maple)).filter((r) => r.id === milk.id)
    assert.equal(row.checked_by, alex)
    assert.ok(new Date(row.checked_at).getFullYear() > 2001, "server clock, not the client's")

    // Re-checking by someone else keeps the original checker.
    await t.as(blair, () => t.q("update public.shopping_list_items set checked_at = now() where id = $1", [milk.id]))
    ;[row] = (await list(maple)).filter((r) => r.id === milk.id)
    assert.equal(row.checked_by, alex)

    await t.as(blair, () => t.q("update public.shopping_list_items set checked_at = null where id = $1", [milk.id]))
    ;[row] = (await list(maple)).filter((r) => r.id === milk.id)
    assert.deepEqual([row.checked_at, row.checked_by], [null, null])

    await t.as(blair, async () => {
      await assertRejects(() => t.q("update public.shopping_list_items set checked_by = $1 where id = $2", [casey, milk.id]), /permission denied/)
      await assertRejects(() => t.q("update public.shopping_list_items set added_by = $1 where id = $2", [casey, milk.id]), /permission denied/)
      await assertRejects(() => t.q("update public.shopping_list_items set household_id = $1 where id = $2", [caseyHome, milk.id]), /permission denied/)
    })
  })

  test("putting a trip away moves items into the pantry and off the list in one batch", async () => {
    const [eggs] = await t.as(alex, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [maple, JSON.stringify([{ name: "eggs", quantity: 2, unit: "count", category: "dairy" }])])),
    ).then((rows) => rows.map((r) => ({ id: r.add_pantry_items })))
    const [eggsLine] = await addToList(blair, maple, [{ name: "eggs", quantity: 12, unit: "count", category: "dairy" }])
    const chicken = (await list(maple)).find((r) => r.name === "chicken thighs")

    const before = (await t.q("select count(*)::int as n from public.activity_log where household_id = $1", [maple]))[0].n
    const pantryIds = (
      await putAway(blair, maple, [chicken.id, eggsLine], [
        { name: "chicken thighs", quantity: 3, unit: "lb", category: "meat", expires_on: "2026-10-01" },
        { merge_into: eggs.id, quantity: 12, expires_on: "2026-10-20" },
      ])
    ).map((r) => r.complete_shopping_trip)
    assert.equal(pantryIds.length, 2)

    assert.deepEqual((await list(maple)).map((r) => r.name), ["milk"])
    const pantry = await t.q("select name, quantity::float8 as quantity, created_by from public.pantry_items where household_id = $1 order by name", [maple])
    assert.deepEqual(pantry.map((r) => [r.name, r.quantity]), [["chicken thighs", 3], ["eggs", 14]])
    assert.equal(pantry.find((r) => r.name === "chicken thighs").created_by, blair)

    const log = await t.q("select action, batch_id from public.activity_log where household_id = $1 order by id offset $2", [maple, before])
    assert.deepEqual(log.map((r) => r.action), ["shopped", "shopped"])
    assert.equal(new Set(log.map((r) => r.batch_id)).size, 1)
  })

  test("a trip can't be put away twice", async () => {
    const [line] = await addToList(alex, maple, [{ name: "bananas", quantity: 6, unit: "count", category: "produce" }])
    const bananas = [{ name: "bananas", quantity: 6, unit: "count", category: "produce" }]
    await putAway(alex, maple, [line], bananas)
    await assertRejects(() => putAway(blair, maple, [line], bananas), /already put some of these away/)
    const [row] = await t.q("select count(*)::int as n, sum(quantity)::float8 as total from public.pantry_items where household_id = $1 and name = 'bananas'", [maple])
    assert.deepEqual(row, { n: 1, total: 6 })
  })

  test("clearing lines without adding them to the pantry", async () => {
    const [line] = await addToList(alex, maple, [{ name: "paper towels", quantity: null, unit: null, category: "other" }])
    const added = await putAway(alex, maple, [line], [])
    assert.equal(added.length, 0)
    assert.equal((await list(maple)).some((r) => r.name === "paper towels"), false)
    await t.as(alex, () => assertRejects(() => t.q("select * from public.complete_shopping_trip($1, '{}'::uuid[], '[]')", [maple]), /Nothing to put away/))
  })

  test("outsiders can't see, add to, or put away another household's list", async () => {
    const [milk] = (await list(maple)).filter((r) => r.name === "milk")
    await t.as(casey, async () => {
      assert.equal((await t.q("select count(*)::int as n from public.shopping_list_items")).at(0).n, 0)
      await assertRejects(
        () => t.q("select * from public.add_to_shopping_list($1, $2)", [maple, JSON.stringify([{ name: "x" }])]),
        /row-level security/,
      )
      assert.equal((await t.q("update public.shopping_list_items set checked_at = now() where id = $1 returning id", [milk.id])).length, 0)
      assert.equal((await t.q("delete from public.shopping_list_items where id = $1 returning id", [milk.id])).length, 0)
    })
    await assertRejects(() => putAway(casey, maple, [milk.id], [{ name: "milk", quantity: 1, unit: "gal", category: "dairy" }]), /already put some of these away/)
    assert.equal((await list(maple)).some((r) => r.id === milk.id), true)
  })

  test("list changes reach members' realtime channel only", async () => {
    const topic = `household:${maple}`
    const count = (user) =>
      t.as(user, async () => (await t.q("select count(*)::int as n from realtime.messages where payload->>'table' = 'shopping_list_items'"))[0].n, { topic })
    assert.ok((await count(blair)) > 0)
    assert.equal(await count(casey), 0)
  })

  test("a deleted household takes its list with it; signed-out requests get nothing", async () => {
    await t.as(blair, () => t.q("select public.leave_household($1)", [maple]))
    await t.as(alex, () => t.q("select public.leave_household($1)", [maple]))
    assert.equal((await list(maple)).length, 0)
    await t.as(null, async () => {
      await assertRejects(() => t.q("select count(*) from public.shopping_list_items"), /permission denied/)
      await assertRejects(() => t.q("select * from public.add_to_shopping_list($1, '[]')", [caseyHome]), /permission denied/)
    })
  })
})
