import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("rate limits and avatar URLs", () => {
  let t, alex, blair, casey, code

  const take = (user, bucket) =>
    t.as(user, async () => (await t.q("select public.take_rate_limit($1) as ok", [bucket]))[0].ok)
  const preview = (user, c) => t.as(user, () => t.q("select * from public.get_invite_preview($1)", [c]))

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
    casey = await t.createUser("c@test.dev", { full_name: "Casey", avatar_url: "javascript:alert(1)" })
    const maple = await t.as(alex, async () => (await t.q("select public.create_household('Maple') as id"))[0].id)
    ;[{ invite_code: code }] = await t.q("select invite_code from public.households where id = $1", [maple])
  })

  test("spending limits count per person and stop at the bucket's limit", async () => {
    for (let i = 0; i < 15; i++) assert.equal(await take(alex, "recipe_search"), true)
    assert.equal(await take(alex, "recipe_search"), false)
    assert.equal(await take(alex, "recipe_search"), false)
    // Someone else still has theirs, and other buckets are separate.
    assert.equal(await take(blair, "recipe_search"), true)
    assert.equal(await take(alex, "recipe_open"), true)
    const [{ hits }] = await t.q("select hits from private.rate_limits where bucket = 'recipe_search' and user_id = $1", [alex])
    assert.equal(hits, 15)
  })

  test("a new window starts fresh, and old windows are cleared", async () => {
    await t.q("update private.rate_limits set window_start = window_start - interval '2 hours' where user_id = $1", [alex])
    assert.equal(await take(alex, "recipe_search"), true)
    const rows = await t.q("select count(*)::int as n from private.rate_limits where bucket = 'recipe_search' and user_id = $1", [alex])
    assert.equal(rows[0].n, 1)
  })

  test("callers can't pick buckets, touch the table, or call the private functions", async () => {
    assert.equal(await take(alex, "invite_miss"), null)
    assert.equal(await take(alex, "anything"), null)
    await t.as(alex, async () => {
      await assertRejects(() => t.q("select * from private.rate_limits"), /permission denied/)
      await assertRejects(() => t.q("select private.take_rate_limit('recipe_search')"), /permission denied/)
      await assertRejects(() => t.q("delete from private.rate_limits"), /permission denied/)
    })
    await t.as(null, () => assertRejects(() => t.q("select public.take_rate_limit('recipe_search')"), /permission denied/))
  })

  test("wrong invite codes are limited; right ones don't count", async () => {
    // Right code: works, and doesn't use up tries.
    for (let i = 0; i < 12; i++) assert.equal((await preview(blair, code)).length, 1)
    // 10 wrong guesses are allowed (typos), then everything stops.
    for (let i = 0; i < 10; i++) assert.equal((await preview(blair, `ZZZZZZ${String(i).padStart(2, "2")}`)).length, 0)
    await assertRejects(() => preview(blair, code), /Too many tries/)
    await t.as(blair, () => assertRejects(() => t.q("select public.join_household($1)", [code]), /Too many tries/))
    // Other people aren't affected.
    assert.equal((await preview(casey, code)).length, 1)
  })

  test("join_household counts misses too, returning null instead of raising", async () => {
    await t.as(casey, async () => {
      for (let i = 0; i < 10; i++) {
        assert.equal((await t.q("select public.join_household('ZZZZZZZZ') as id"))[0].id, null)
      }
      await assertRejects(() => t.q("select public.join_household($1)", [code]), /Too many tries/)
    })
    // After the window, the right code works.
    await t.q("update private.rate_limits set window_start = window_start - interval '1 hour' where user_id = $1", [casey])
    await t.as(casey, async () => {
      assert.ok((await t.q("select public.join_household($1) as id", [code]))[0].id)
    })
  })

  test("avatar URLs must be https", async () => {
    // Set at sign-up from user metadata: cleaned, not an error.
    const [casey1] = await t.q("select avatar_url from public.profiles where id = $1", [casey])
    assert.equal(casey1.avatar_url, null)

    const set = (url) =>
      t.as(alex, async () => {
        await t.q("update public.profiles set avatar_url = $1 where id = $2", [url, alex])
        return (await t.q("select avatar_url from public.profiles where id = $1", [alex]))[0].avatar_url
      })
    assert.equal(await set("https://lh3.googleusercontent.com/a/abc=s96-c"), "https://lh3.googleusercontent.com/a/abc=s96-c")
    assert.equal(await set("http://tracker.example/pixel.gif"), null)
    assert.equal(await set("javascript:alert(1)"), null)
    assert.equal(await set("data:image/svg+xml,<svg/>"), null)
    assert.equal(await set(`https://a.example/${"x".repeat(2100)}`), null)
  })
})
