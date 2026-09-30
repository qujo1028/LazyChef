import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

const CODE = /^[A-HJKMNP-Z2-9]{8}$/

describe("households", () => {
  let t, alex, blair, casey, maple, originalCode

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex Doe", avatar_url: "https://x/a.png" })
    blair = await t.createUser("b@test.dev", { display_name: "Blair" })
    casey = await t.createUser("casey@test.dev")
  })

  test("sign-up creates a profile from Google or form metadata", async () => {
    const rows = await t.q("select id, display_name, avatar_url from public.profiles")
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    assert.equal(byId[alex].display_name, "Alex Doe")
    assert.equal(byId[alex].avatar_url, "https://x/a.png")
    assert.equal(byId[blair].display_name, "Blair")
    assert.equal(byId[casey].display_name, "casey")
  })

  test("creating a household makes you its owner", async () => {
    maple = await t.as(alex, async () => (await t.q("select public.create_household('  Maple St  ') as id"))[0].id)
    const [house] = await t.q("select * from public.households where id = $1", [maple])
    originalCode = house.invite_code
    assert.equal(house.name, "Maple St")
    assert.match(house.invite_code, CODE)
    const [member] = await t.q("select role from public.household_members where household_id = $1", [maple])
    assert.equal(member.role, "owner")
    const [profile] = await t.q("select active_household_id from public.profiles where id = $1", [alex])
    assert.equal(profile.active_household_id, maple)
    await t.as(alex, () => assertRejects(() => t.q("select public.create_household('   ')"), /1 to 60/))
  })

  test("invite codes let people preview and join", async () => {
    const messy = originalCode.toLowerCase().replace(/^(.{4})/, "$1 - ")
    await t.as(blair, async () => {
      assert.equal((await t.q("select count(*)::int as n from public.households"))[0].n, 0)
      const [preview] = await t.q("select * from public.get_invite_preview($1)", [messy])
      assert.deepEqual(
        { name: preview.household_name, members: preview.member_count, isMember: preview.is_member },
        { name: "Maple St", members: 1, isMember: false },
      )
      assert.equal((await t.q("select public.join_household($1) as id", [messy]))[0].id, maple)
      await t.q("select public.join_household($1)", [originalCode]) // joining twice is harmless
      assert.equal((await t.q("select count(*)::int as n from public.household_members"))[0].n, 2)
      const names = (await t.q("select display_name from public.profiles order by display_name")).map((r) => r.display_name)
      assert.deepEqual(names, ["Alex Doe", "Blair"])
    })
  })

  test("outsiders see nothing", async () => {
    await t.as(casey, async () => {
      assert.equal((await t.q("select count(*)::int as n from public.profiles"))[0].n, 1)
      assert.equal((await t.q("select * from public.get_invite_preview('ZZZZZZZZ')")).length, 0)
      // A wrong code returns null (see 20261003000100_security_hardening.sql).
      assert.equal((await t.q("select public.join_household('ZZZZZZZZ') as id"))[0].id, null)
    })
  })

  test("only members receive the household's realtime broadcasts", async () => {
    const topic = `household:${maple}`
    const count = () => t.q("select count(*)::int as n from realtime.messages").then((r) => r[0].n)
    assert.ok((await t.as(blair, count, { topic })) > 0)
    assert.equal(await t.as(casey, count, { topic }), 0)
  })

  test("members can't do owner things or reach other households", async () => {
    const caseyHome = await t.as(casey, async () => (await t.q("select public.create_household('Casey Home') as id"))[0].id)
    await t.as(blair, async () => {
      await assertRejects(() => t.q("select public.regenerate_invite_code($1)", [maple]), /Only the household owner/)
      assert.equal((await t.q("update public.households set name = 'Hijacked' where id = $1 returning id", [maple])).length, 0)
      assert.equal((await t.q("update public.profiles set display_name = 'B2' where id = $1 returning id", [blair])).length, 1)
      assert.equal((await t.q("update public.profiles set display_name = 'x' where id = $1 returning id", [alex])).length, 0)
      await assertRejects(
        () => t.q("update public.profiles set active_household_id = $1 where id = $2", [caseyHome, blair]),
        /row-level security/,
      )
      await assertRejects(
        () => t.q("insert into public.household_members (household_id, user_id) values ($1, $2)", [caseyHome, blair]),
        /permission denied/,
      )
      await assertRejects(() => t.q("select public.remove_member($1, $2)", [maple, alex]), /Only the household owner/)
    })
  })

  test("owners can rename, reset the code and remove people", async () => {
    await t.as(alex, async () => {
      assert.equal((await t.q("update public.households set name = 'Maple Street' where id = $1 returning id", [maple])).length, 1)
      await assertRejects(
        () => t.q("update public.households set invite_code = 'AAAAAAAA' where id = $1", [maple]),
        /permission denied/,
      )
      const [{ code }] = await t.q("select public.regenerate_invite_code($1) as code", [maple])
      assert.match(code, CODE)
      assert.notEqual(code, originalCode)
      await assertRejects(() => t.q("select public.remove_member($1, $2)", [maple, alex]), /Leave household/)
      await t.q("select public.remove_member($1, $2)", [maple, blair])
    })
    const [profile] = await t.q("select active_household_id from public.profiles where id = $1", [blair])
    assert.equal(profile.active_household_id, null)
    await t.as(blair, async () => assert.equal((await t.q("select count(*)::int as n from public.households"))[0].n, 0))
  })

  test("ownership passes on, and the last one out deletes the household", async () => {
    const [{ invite_code }] = await t.q("select invite_code from public.households where id = $1", [maple])
    await t.as(blair, () => t.q("select public.join_household($1)", [invite_code]))
    await t.as(alex, () => t.q("select public.leave_household($1)", [maple]))
    const [member] = await t.q("select role from public.household_members where household_id = $1 and user_id = $2", [maple, blair])
    assert.equal(member.role, "owner")
    await t.as(blair, () => t.q("select public.leave_household($1)", [maple]))
    assert.equal((await t.q("select count(*)::int as n from public.households where id = $1", [maple]))[0].n, 0)
    await t.as(blair, () => assertRejects(() => t.q("select public.leave_household($1)", [maple]), /not a member/))
  })

  test("signed-out requests get nothing", async () => {
    await t.as(null, async () => {
      await assertRejects(() => t.q("select count(*) from public.profiles"), /permission denied/)
      await assertRejects(() => t.q("select public.create_household('x')"), /permission denied/)
    })
  })
})
