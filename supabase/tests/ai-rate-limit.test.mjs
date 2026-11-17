import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { createTestDb } from "./harness.mjs"

describe("AI rate limit", () => {
  let t, alex, blair

  const take = (user, bucket) =>
    t.as(user, async () => (await t.q("select public.take_rate_limit($1) as ok", [bucket]))[0].ok)

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
  })

  test("the ai bucket allows 30 an hour per person", async () => {
    for (let i = 0; i < 30; i++) assert.equal(await take(alex, "ai"), true)
    assert.equal(await take(alex, "ai"), false)
    assert.equal(await take(blair, "ai"), true)
  })

  test("other buckets still work and unknown ones are still refused", async () => {
    assert.equal(await take(alex, "recipe_search"), true)
    assert.equal(await take(alex, "invite_miss"), null)
    assert.equal(await take(alex, "made_up"), null)
  })

  test("anon still can't call it", async () => {
    const [{ ok }] = await t.q(
      "select has_function_privilege('anon', 'public.take_rate_limit(text)', 'execute') as ok",
    )
    assert.equal(ok, false)
  })
})
