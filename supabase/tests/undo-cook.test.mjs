import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("undo cook", () => {
  let t, alex, blair, casey, maple, ids

  const addItems = (user, household, items) =>
    t.as(user, async () =>
      (await t.q("select * from public.add_pantry_items($1, $2)", [household, JSON.stringify(items)])).map((r) => r.add_pantry_items),
    )
  const cook = (user, household, deductions) =>
    t.as(user, () =>
      t.q(
        "select item_id, quantity_before::float8 as before, quantity_after::float8 as after, batch_id::text as batch from public.cook_recipe($1, $2, $3, $4)",
        [household, 715538, "Bread omelette", JSON.stringify(deductions)],
      ),
    )
  const undo = (user, household, batch, amounts) =>
    t.as(user, () => t.q("select public.undo_cook($1, $2, $3)", [household, batch, JSON.stringify(amounts)]))
  const quantity = async (id) => {
    const [row] = await t.q("select quantity::float8 as quantity from public.pantry_items where id = $1", [id])
    return row.quantity
  }
  const actions = async (household) =>
    (await t.q("select action from public.activity_log where household_id = $1 order by id", [household])).map((r) => r.action)

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey" })
    maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    await t.as(casey, () => t.q("select public.create_household('Casey Home')"))
    const [eggs, milk] = await addItems(alex, maple, [
      { name: "eggs", quantity: 12, unit: "count", category: "dairy" },
      { name: "milk", quantity: 1, unit: "cup", category: "dairy", expires_on: "2026-12-01" },
    ])
    ids = { eggs, milk }
  })

  test("cook_recipe returns the batch its activity rows share", async () => {
    const rows = await cook(alex, maple, [{ item_id: ids.eggs, amount: 2 }])
    const [{ batch_id }] = await t.q("select batch_id::text from public.activity_log where action = 'cooked' order by id desc limit 1")
    assert.equal(rows[0].batch, batch_id)
    await undo(alex, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 2 }])
  })

  test("puts amounts back and leaves no trace of the cook in the log", async () => {
    const before = await actions(maple)
    const rows = await cook(alex, maple, [
      { item_id: ids.eggs, amount: 2 },
      { item_id: ids.milk, amount: 5 },
    ])
    assert.equal(await quantity(ids.milk), 0)
    await undo(alex, maple, rows[0].batch, [
      { item_id: ids.eggs, amount: 2 },
      { item_id: ids.milk, amount: 1 },
    ])
    assert.equal(await quantity(ids.eggs), 12)
    assert.equal(await quantity(ids.milk), 1)
    const [{ expires_on }] = await t.q("select expires_on::text from public.pantry_items where id = $1", [ids.milk])
    assert.equal(expires_on, "2026-12-01", "a ran-out item keeps its expiry")
    assert.deepEqual(await actions(maple), before, "no cooked or restocked rows left behind")
  })

  test("can't undo twice, someone else's cook, or another household's", async () => {
    const rows = await cook(alex, maple, [{ item_id: ids.eggs, amount: 1 }])
    await assertRejects(() => undo(blair, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 1 }]), /already undone/)
    await assertRejects(() => undo(casey, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 1 }]), /Not a member/)
    await undo(alex, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 1 }])
    await assertRejects(() => undo(alex, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 1 }]), /already undone/)
    assert.equal(await quantity(ids.eggs), 12)
  })

  test("rejects bad amounts and signed-out callers", async () => {
    const rows = await cook(alex, maple, [{ item_id: ids.eggs, amount: 1 }])
    await assertRejects(() => undo(alex, maple, rows[0].batch, [{ item_id: ids.eggs, amount: 0 }]), /more than 0/)
    await t.as(null, () =>
      assertRejects(() => t.q("select public.undo_cook($1, 1, '[]')", [maple]), /permission denied/),
    )
    assert.equal(await quantity(ids.eggs), 11)
  })
})
