import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("spoonacular cache and usage", () => {
  let t, alex, blair, casey, maple, caseyHome

  const put = (user, household, key, response, ttl) =>
    t.as(user, async () =>
      (await t.q("select public.put_spoonacular_cache($1, $2, $3, $4) as expires", [household, key, JSON.stringify(response), ttl ?? null]))[0]
        .expires,
    )
  const read = (user, household) =>
    t.as(user, () =>
      t.q("select cache_key, response from public.spoonacular_cache where household_id = $1 order by cache_key", [household]),
    )
  const usage = () =>
    t.q("select day, points_used::float8 as used, points_left::float8 as left, requests from public.spoonacular_usage")

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

  test("housemates share cached responses; other households can't see them", async () => {
    await put(alex, maple, "find:abc", [{ id: 1, title: "Soup" }])
    assert.deepEqual(await read(blair, maple), [{ cache_key: "find:abc", response: [{ id: 1, title: "Soup" }] }])
    assert.deepEqual(await read(casey, maple), [])
  })

  test("writing again replaces the entry", async () => {
    await put(blair, maple, "find:abc", [{ id: 2, title: "Stew" }])
    assert.deepEqual(await read(alex, maple), [{ cache_key: "find:abc", response: [{ id: 2, title: "Stew" }] }])
  })

  test("entries last at most an hour, whatever the caller asks for", async () => {
    const [{ now }] = await t.q("select now() as now")
    const long = new Date(await put(alex, maple, "info:1", { id: 1 }, 999999))
    assert.ok(long - new Date(now) <= 3600_000 + 1000)
    const short = new Date(await put(alex, maple, "info:2", { id: 2 }, 60))
    assert.ok(short - new Date(now) <= 61_000)
  })

  test("expired entries are cleared on the next write", async () => {
    await t.q("update public.spoonacular_cache set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where cache_key = 'info:1'")
    await put(alex, maple, "info:3", { id: 3 })
    const keys = (await read(alex, maple)).map((r) => r.cache_key)
    assert.ok(!keys.includes("info:1"))
    assert.ok(keys.includes("info:3"))
  })

  test("only members write, and only through the function", async () => {
    await t.as(casey, () =>
      assertRejects(() => t.q("select public.put_spoonacular_cache($1, 'x', '{}'::jsonb)", [maple]), /not in that household/),
    )
    await t.as(alex, () =>
      assertRejects(
        () => t.q("insert into public.spoonacular_cache (household_id, cache_key, response, expires_at) values ($1, 'y', '{}', now())", [maple]),
        /permission denied/,
      ),
    )
    await t.as(alex, () =>
      assertRejects(() => t.q("update public.spoonacular_cache set expires_at = now() + interval '1 year'"), /permission denied/),
    )
    await t.as(null, () =>
      assertRejects(() => t.q("select public.put_spoonacular_cache($1, 'z', '{}'::jsonb)", [maple]), /permission denied/),
    )
    // Casey's own household works.
    await put(casey, caseyHome, "find:x", [])
    assert.equal((await read(casey, caseyHome)).length, 1)
  })

  test("usage keeps the highest used and lowest left for the day, whatever order requests finish in", async () => {
    await t.as(alex, () => t.q("select public.record_spoonacular_usage(3.5, 46.5)"))
    await t.as(casey, () => t.q("select public.record_spoonacular_usage(2, 48)"))
    const [row] = await usage()
    assert.equal(row.used, 3.5)
    assert.equal(row.left, 46.5)
    assert.equal(row.requests, 2)
    // Everyone signed in can read it; nobody can write it directly.
    assert.equal((await t.as(blair, () => t.q("select * from public.spoonacular_usage"))).length, 1)
    await t.as(blair, () =>
      assertRejects(() => t.q("update public.spoonacular_usage set points_left = 50"), /permission denied/),
    )
  })

  test("usage rejects nonsense and anonymous callers", async () => {
    await t.as(alex, () => assertRejects(() => t.q("select public.record_spoonacular_usage(-1, 10)"), /don't look right/))
    await t.as(null, () => assertRejects(() => t.q("select public.record_spoonacular_usage(1, 10)"), /permission denied/))
  })
})
