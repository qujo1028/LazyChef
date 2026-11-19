import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/features/auth/apple-tokens", () => ({ revokeAppleTokens: async () => ({ usedApple: false, revoked: false }) }))

const { handleDeleteAccount } = await import("./api")

const request = () => new Request("http://localhost/api/account/delete", { method: "POST", headers: { authorization: "Bearer t" } })

/** The caller's client: lists their households. */
const userClient = (result: { data: unknown; error: unknown } = { data: [{ household_id: "h1" }], error: null }) =>
  ({ from: () => ({ select: () => ({ eq: async () => result }) }) }) as never

/** The admin client: deletes the user; h1 is gone afterwards, so its photos go. */
function adminClient(deleteError: unknown = null) {
  const deleteUser = vi.fn(async () => ({ error: deleteError }))
  const remove = vi.fn(async () => ({ error: null }))
  let listed = 0
  const client = {
    auth: { admin: { deleteUser } },
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
    storage: {
      from: () => ({
        list: async () => ({ data: listed++ === 0 ? [{ name: "a.jpg" }] : [], error: null }),
        remove,
      }),
    },
  }
  return { client: client as never, deleteUser, remove }
}

const authed = (supabase = userClient()) => async () => ({ user: { id: "u1" } as never, supabase })

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/account/delete", () => {
  it("passes an auth failure straight through", async () => {
    const response = await handleDeleteAccount(request(), {
      authenticate: async () => Response.json({ ok: false, code: "unauthorized", error: "x" }, { status: 401 }),
    })
    expect(response.status).toBe(401)
  })

  it("is not_configured without the secret key", async () => {
    const response = await handleDeleteAccount(request(), { authenticate: authed(), admin: null })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, code: "not_configured" })
  })

  it("deletes the person and their solo household's photos", async () => {
    const admin = adminClient()
    const response = await handleDeleteAccount(request(), { authenticate: authed(), admin: admin.client })
    expect(await response.json()).toEqual({ ok: true, appleNotRevoked: false })
    expect(admin.deleteUser).toHaveBeenCalledWith("u1")
    expect(admin.remove).toHaveBeenCalledWith(["h1/a.jpg"])
  })

  it("says when Apple couldn't be revoked", async () => {
    const admin = adminClient()
    const response = await handleDeleteAccount(request(), {
      authenticate: authed(),
      admin: admin.client,
      revokeApple: async () => ({ usedApple: true, revoked: false }),
    })
    expect(await response.json()).toEqual({ ok: true, appleNotRevoked: true })
  })

  it("fails without deleting when the household list can't be read", async () => {
    const admin = adminClient()
    const response = await handleDeleteAccount(request(), {
      authenticate: authed(userClient({ data: null, error: { message: "nope" } })),
      admin: admin.client,
    })
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, code: "failed" })
    expect(admin.deleteUser).not.toHaveBeenCalled()
  })

  it("fails when Supabase won't delete the user", async () => {
    const admin = adminClient({ message: "boom" })
    const response = await handleDeleteAccount(request(), { authenticate: authed(), admin: admin.client })
    expect(response.status).toBe(500)
    expect(admin.remove).not.toHaveBeenCalled()
  })
})
