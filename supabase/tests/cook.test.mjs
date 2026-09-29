import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("cook mode", () => {
  let t, alex, blair, casey, maple, caseyHome, ids

  const addItems = (user, household, items) =>
    t.as(user, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [household, JSON.stringify(items)])).map((r) => r.add_pantry_items),
    )
  const cook = (user, household, deductions, title = "Chicken Tikka Masala") =>
    t.as(user, () =>
      t.q(
        "select item_id, name, unit, quantity_before::float8 as before, quantity_after::float8 as after from public.cook_recipe($1, $2, $3, $4)",
        [household, 715538, title, JSON.stringify(deductions)],
      ),
    )
  const quantity = async (id) => {
    const [row] = await t.q("select quantity::float8 as quantity from public.pantry_items where id = $1", [id])
    return row.quantity
  }
  const log = (household) =>
    t.q(
      "select action, item_name, quantity::float8 as quantity, unit, actor_id, batch_id, details from public.activity_log where household_id = $1 order by id",
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
    const [chicken, rice, eggs, salt] = await addItems(alex, maple, [
      { name: "chicken breast", quantity: 2, unit: "lb", category: "meat" },
      { name: "rice", quantity: 3, unit: "cup", category: "grains" },
      { name: "eggs", quantity: 2, unit: "count", category: "dairy" },
      { name: "salt", quantity: null, unit: "count", category: "spices", is_staple: true },
    ])
    ids = { chicken, rice, eggs, salt }
  })

  test("takes everything out at once, stops at 0, and leaves untracked items alone", async () => {
    const before = (await log(maple)).length
    const result = await cook(blair, maple, [
      { item_id: ids.chicken, amount: 1.5 },
      { item_id: ids.eggs, amount: 3 },
      { item_id: ids.salt, amount: 1 },
    ])
    assert.deepEqual(
      result.map((r) => [r.name, r.before, r.after]),
      [
        ["chicken breast", 2, 0.5],
        ["eggs", 2, 0],
        ["salt", null, null],
      ],
    )
    assert.equal(await quantity(ids.chicken), 0.5)
    assert.equal(await quantity(ids.eggs), 0)
    assert.equal(await quantity(ids.salt), null)
    assert.equal(await quantity(ids.rice), 3)

    const rows = (await log(maple)).slice(before)
    assert.deepEqual(
      rows.map((r) => [r.action, r.item_name, r.quantity, r.actor_id]),
      [
        ["cooked", "chicken breast", 1.5, blair],
        ["cooked", "eggs", 2, blair],
      ],
    )
    assert.equal(new Set(rows.map((r) => r.batch_id)).size, 1, "one cook = one batch")
    assert.deepEqual(rows[0].details, { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" })
  })

  test("outside cook_recipe, using some is still logged as used", async () => {
    await t.as(alex, () => t.q("select public.adjust_pantry_quantity($1, -1)", [ids.rice]))
    const last = (await log(maple)).at(-1)
    assert.deepEqual([last.action, last.details], ["used", {}])
  })

  test("all or nothing: a missing item undoes the rest", async () => {
    await assertRejects(
      () => cook(alex, maple, [{ item_id: ids.rice, amount: 1 }, { item_id: "00000000-0000-0000-0000-000000000000", amount: 1 }]),
      /just removed from the pantry/,
    )
    assert.equal(await quantity(ids.rice), 2)
  })

  test("rejects bad amounts, no title and empty lists", async () => {
    await assertRejects(() => cook(alex, maple, [{ item_id: ids.rice, amount: 0 }]), /more than 0/)
    await assertRejects(() => cook(alex, maple, [{ item_id: ids.rice, amount: -2 }]), /more than 0/)
    await assertRejects(() => cook(alex, maple, [{ item_id: ids.rice, amount: 1 }], "  "), /needs a title/)
    await assertRejects(() => cook(alex, maple, []), /at least one/)
    assert.equal(await quantity(ids.rice), 2)
  })

  test("other households' items and signed-out callers can't be touched", async () => {
    await assertRejects(() => cook(casey, maple, [{ item_id: ids.rice, amount: 1 }]), /just removed from the pantry/)
    await assertRejects(() => cook(casey, caseyHome, [{ item_id: ids.rice, amount: 1 }]), /just removed from the pantry/)
    await t.as(null, () =>
      assertRejects(
        () => t.q("select * from public.cook_recipe($1, 1, 'x', $2)", [maple, JSON.stringify([{ item_id: ids.rice, amount: 1 }])]),
        /permission denied/,
      ),
    )
    assert.equal(await quantity(ids.rice), 2)
  })

  test("a ran-out item can be made untracked again instead of adding a second one", async () => {
    await addItems(alex, maple, [{ merge_into: ids.eggs, untrack: true }])
    assert.equal(await quantity(ids.eggs), null)
    const [{ count }] = await t.q("select count(*)::int as count from public.pantry_items where household_id = $1 and name = 'eggs'", [maple])
    assert.equal(count, 1)
  })
})
