import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

// Apple refresh tokens are for the server (service_role) only: signed-in people,
// including the token's owner, and anonymous visitors can't read or write them.
describe("apple refresh tokens", () => {
  let t, alex, blair

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    await t.q("insert into public.apple_refresh_tokens (user_id, refresh_token) values ($1, 'r.alex')", [alex])
  })

  test("signed-in people can't read anyone's token, even their own", async () => {
    for (const user of [alex, blair]) {
      await t.as(user, () => assertRejects(() => t.q("select * from public.apple_refresh_tokens"), /permission denied/))
    }
  })

  test("signed-in people can't write tokens", async () => {
    await t.as(alex, async () => {
      await assertRejects(
        () => t.q("insert into public.apple_refresh_tokens (user_id, refresh_token) values ($1, 'x')", [alex]),
        /permission denied/,
      )
      await assertRejects(() => t.q("update public.apple_refresh_tokens set refresh_token = 'x'"), /permission denied/)
      await assertRejects(() => t.q("delete from public.apple_refresh_tokens"), /permission denied/)
    })
  })

  test("anonymous visitors can't read or write tokens", async () => {
    await t.as(null, async () => {
      await assertRejects(() => t.q("select * from public.apple_refresh_tokens"), /permission denied/)
      await assertRejects(
        () => t.q("insert into public.apple_refresh_tokens (user_id, refresh_token) values ($1, 'x')", [blair]),
        /permission denied/,
      )
    })
  })

  test("even with a stray grant, RLS shows nothing", async () => {
    await t.q("grant select on public.apple_refresh_tokens to authenticated")
    try {
      const rows = await t.as(alex, () => t.q("select * from public.apple_refresh_tokens"))
      assert.deepEqual(rows, [])
    } finally {
      await t.q("revoke select on public.apple_refresh_tokens from authenticated")
    }
  })

  test("the server can read and write them", async () => {
    await t.q("set role service_role")
    try {
      await t.q(
        `insert into public.apple_refresh_tokens (user_id, refresh_token) values ($1, 'r.blair')
         on conflict (user_id) do update set refresh_token = excluded.refresh_token, updated_at = now()`,
        [blair],
      )
      const rows = await t.q("select user_id, refresh_token from public.apple_refresh_tokens order by refresh_token")
      assert.deepEqual(rows, [
        { user_id: alex, refresh_token: "r.alex" },
        { user_id: blair, refresh_token: "r.blair" },
      ])
    } finally {
      await t.q("reset role")
    }
  })

  test("deleting the auth user removes their token", async () => {
    await t.q("delete from auth.users where id = $1", [alex])
    const rows = await t.q("select user_id from public.apple_refresh_tokens")
    assert.deepEqual(rows, [{ user_id: blair }])
  })
})
