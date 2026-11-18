import assert from "node:assert/strict"
import { before, describe, test } from "node:test"

import { assertRejects, createTestDb } from "./harness.mjs"

describe("push notifications", () => {
  let t, alex, blair

  const register = (token, platform = "ios", timezone = "America/New_York", version = "1.0") =>
    t.q("select public.register_device_token($1, $2, $3, $4)", [token, platform, timezone, version])
  const myTokens = () => t.q("select user_id, token, platform, timezone, app_version from public.device_tokens order by token")
  const setPrefs = (expiring, list, joined) =>
    t.q("select public.set_my_notification_prefs($1, $2, $3)", [expiring, list, joined])
  const myPrefs = () => t.q("select user_id, expiring, list, joined from public.notification_prefs")
  const count = async (sql, params) => (await t.q(`select count(*)::int as n from ${sql}`, params))[0].n
  /** Like the server with the secret key. */
  const asService = async (fn) => {
    await t.q("select set_config('request.jwt.claim.sub', '', false)")
    await t.db.exec("set role service_role")
    try {
      return await fn()
    } finally {
      await t.db.exec("reset role")
    }
  }

  before(async () => {
    t = await createTestDb()
    alex = await t.createUser("a@test.dev", { full_name: "Alex" })
    blair = await t.createUser("b@test.dev", { full_name: "Blair" })
  })

  test("registering saves your token, and registering again refreshes it", async () => {
    await t.as(alex, () => register("tok-alex", "ios", "America/New_York", "1.0"))
    await t.as(alex, () => register("tok-alex", "ios", "Pacific/Auckland", "1.1"))
    assert.deepEqual(await t.as(alex, myTokens), [
      { user_id: alex, token: "tok-alex", platform: "ios", timezone: "Pacific/Auckland", app_version: "1.1" },
    ])
  })

  test("an unknown time zone falls back to UTC", async () => {
    await t.as(blair, () => register("tok-blair", "android", "Mars/Olympus_Mons", null))
    const [row] = await t.as(blair, myTokens)
    assert.equal(row.timezone, "UTC")
    assert.equal(row.app_version, null)
  })

  test("you only see and delete your own tokens", async () => {
    assert.deepEqual((await t.as(alex, myTokens)).map((r) => r.token), ["tok-alex"])
    assert.deepEqual((await t.as(blair, myTokens)).map((r) => r.token), ["tok-blair"])
    await t.as(alex, () => t.q("delete from public.device_tokens where token = 'tok-blair'"))
    assert.equal(await count("public.device_tokens where token = 'tok-blair'"), 1)
  })

  test("nobody can write tokens directly", async () => {
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.device_tokens (user_id, platform, token) values ($1, 'ios', 'x')", [blair])),
      /permission denied/,
    )
    await assertRejects(
      () => t.as(alex, () => t.q("update public.device_tokens set user_id = $1", [alex])),
      /permission denied/,
    )
  })

  test("registering someone else's token moves it to you (shared phone)", async () => {
    await t.as(alex, () => register("tok-blair", "android", "UTC", null))
    assert.deepEqual((await t.as(alex, myTokens)).map((r) => r.token), ["tok-alex", "tok-blair"])
    assert.deepEqual(await t.as(blair, myTokens), [])
  })

  test("bad platforms are rejected", async () => {
    await assertRejects(() => t.as(alex, () => register("tok-web", "web")), /check constraint/)
  })

  test("each person keeps at most 10 devices, newest first", async () => {
    for (let i = 0; i < 12; i++) await t.as(blair, () => register(`tok-many-${String(i).padStart(2, "0")}`, "ios", "UTC", null))
    const rows = await t.as(blair, myTokens)
    assert.equal(rows.length, 10)
    assert.ok(!rows.some((r) => r.token === "tok-many-00" || r.token === "tok-many-01"))
  })

  test("signed-out callers can't register, save switches or read", async () => {
    await assertRejects(() => t.as(null, () => register("tok-anon")), /permission denied/)
    await assertRejects(() => t.as(null, () => setPrefs(false, false, false)), /permission denied/)
    await assertRejects(() => t.as(null, myTokens), /permission denied/)
    await assertRejects(() => t.as(null, myPrefs), /permission denied/)
  })

  test("switches start on, and a null leaves a switch as it was", async () => {
    await t.as(alex, () => setPrefs(null, false, null))
    assert.deepEqual(await t.as(alex, myPrefs), [{ user_id: alex, expiring: true, list: false, joined: true }])
    await t.as(alex, () => setPrefs(false, null, null))
    assert.deepEqual(await t.as(alex, myPrefs), [{ user_id: alex, expiring: false, list: false, joined: true }])
  })

  test("you only see your own switches and can't write them directly", async () => {
    await t.as(blair, () => setPrefs(true, true, false))
    assert.deepEqual((await t.as(alex, myPrefs)).map((r) => r.user_id), [alex])
    assert.deepEqual((await t.as(blair, myPrefs)).map((r) => r.user_id), [blair])
    await assertRejects(
      () => t.as(alex, () => t.q("update public.notification_prefs set list = true")),
      /permission denied/,
    )
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.notification_prefs (user_id) values ($1)", [alex])),
      /permission denied/,
    )
  })

  test("the sent log is closed to signed-in users and open to the server", async () => {
    await asService(() =>
      t.q("insert into public.notification_log (user_id, kind, dedupe_key) values ($1, 'expiring', 'expiring:2026-11-20')", [alex]),
    )
    // The unique key is what makes a second claim fail.
    await assertRejects(
      () =>
        asService(() =>
          t.q("insert into public.notification_log (user_id, kind, dedupe_key) values ($1, 'expiring', 'expiring:2026-11-20')", [alex]),
        ),
      /duplicate key/,
    )
    await assertRejects(() => t.as(alex, () => t.q("select * from public.notification_log")), /permission denied/)
    await assertRejects(
      () => t.as(alex, () => t.q("insert into public.notification_log (user_id, kind, dedupe_key) values ($1, 'list', 'x')", [alex])),
      /permission denied/,
    )
    await assertRejects(() => t.as(null, () => t.q("select * from public.notification_log")), /permission denied/)
    assert.equal(await asService(() => count("public.device_tokens")), await count("public.device_tokens"))
  })

  test("deleting the account removes tokens, switches and the sent log", async () => {
    await t.q("select set_config('request.jwt.claim.sub', '', false)")
    await t.q("delete from auth.users where id = $1", [alex])
    assert.equal(await count("public.device_tokens where user_id = $1", [alex]), 0)
    assert.equal(await count("public.notification_prefs where user_id = $1", [alex]), 0)
    assert.equal(await count("public.notification_log where user_id = $1", [alex]), 0)
    // Blair's rows stay.
    assert.ok((await count("public.device_tokens where user_id = $1", [blair])) > 0)
    assert.equal(await count("public.notification_prefs where user_id = $1", [blair]), 1)
  })
})
