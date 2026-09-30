import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("household barcodes", () => {
  let t, alex, blair, casey, maple, caseyHome

  const remember = (user, household, rows) =>
    t.as(user, () =>
      t.q(
        `insert into public.household_barcodes (household_id, code, name, quantity, unit)
         select $1, x.code, x.name, x.quantity, x.unit
         from jsonb_to_recordset($2) as x(code text, name text, quantity numeric, unit text)
         on conflict (household_id, code) do update
           set name = excluded.name, quantity = excluded.quantity, unit = excluded.unit`,
        [household, JSON.stringify(rows)],
      ),
    )
  const codes = (user, household) =>
    t.as(user, () =>
      t.q(
        "select code, name, quantity::float8 as quantity, unit, saved_by from public.household_barcodes where household_id = $1 order by code",
        [household],
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
  })

  test("members remember codes, stamped with who saved them", async () => {
    await remember(alex, maple, [
      { code: "041303000526", name: "eggs", quantity: 24, unit: "count" },
      { code: "0070038000563", name: "whole milk", quantity: 1, unit: "gal" },
    ])
    assert.deepEqual(await codes(blair, maple), [
      { code: "0070038000563", name: "whole milk", quantity: 1, unit: "gal", saved_by: alex },
      { code: "041303000526", name: "eggs", quantity: 24, unit: "count", saved_by: alex },
    ])
  })

  test("saving again renames it, and whoever saved it last is recorded", async () => {
    await remember(blair, maple, [{ code: "041303000526", name: "brown eggs", quantity: 18, unit: "count" }])
    const [eggs] = (await codes(alex, maple)).filter((r) => r.code === "041303000526")
    assert.deepEqual(eggs, { code: "041303000526", name: "brown eggs", quantity: 18, unit: "count", saved_by: blair })
  })

  test("members rename a code with a plain update, but can't change the code or its household", async () => {
    await t.as(alex, () =>
      t.q("update public.household_barcodes set name = 'large eggs', quantity = 12 where household_id = $1 and code = '041303000526'", [maple]),
    )
    const [eggs] = (await codes(alex, maple)).filter((r) => r.code === "041303000526")
    assert.deepEqual([eggs.name, eggs.quantity, eggs.saved_by], ["large eggs", 12, alex])
    await t.as(alex, () =>
      assertRejects(() => t.q("update public.household_barcodes set code = '12345678' where household_id = $1", [maple]), /permission denied/),
    )
    await t.as(alex, () =>
      assertRejects(
        () => t.q("update public.household_barcodes set household_id = $1 where household_id = $2", [caseyHome, maple]),
        /permission denied/,
      ),
    )
  })

  test("codes must look like barcodes, and saved_by can't be forged", async () => {
    await t.as(alex, () => assertRejects(() => remember(alex, maple, [{ code: "12ab", name: "x", quantity: null, unit: "count" }]), /check constraint/))
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.household_barcodes (household_id, code, name, saved_by) values ($1, '12345678', 'x', $2)", [maple, blair]),
        /permission denied/,
      ),
    )
  })

  test("other households can't see, add, change or remove them", async () => {
    assert.deepEqual(await codes(casey, maple), [])
    await t.as(casey, () =>
      assertRejects(() => remember(casey, maple, [{ code: "12345678", name: "nope", quantity: null, unit: "count" }]), /row-level security/),
    )
    await t.as(casey, () => t.q("update public.household_barcodes set name = 'hacked' where household_id = $1", [maple]))
    await t.as(casey, () => t.q("delete from public.household_barcodes where household_id = $1", [maple]))
    assert.equal((await codes(alex, maple)).length, 2)
    assert.ok((await codes(alex, maple)).every((r) => r.name !== "hacked"))
    assert.deepEqual(await codes(casey, caseyHome), [])
  })

  test("signed-out requests see nothing, and a deleted household takes its codes with it", async () => {
    await t.as(null, () => assertRejects(() => t.q("select * from public.household_barcodes"), /permission denied/))
    await t.q("delete from public.households where id = $1", [maple])
    assert.deepEqual(await t.q("select * from public.household_barcodes where household_id = $1", [maple]), [])
  })
})
