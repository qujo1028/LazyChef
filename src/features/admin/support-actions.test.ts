import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
  findUserByEmail: vi.fn(),
  grantComp: vi.fn(),
  revokeComp: vi.fn(),
  order: [] as string[],
}))

vi.mock("@/features/admin/guard", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/features/admin/audit", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/features/admin/support-db", () => ({
  findUserByEmail: mocks.findUserByEmail,
  grantComp: mocks.grantComp,
  revokeComp: mocks.revokeComp,
}))

import { grantCompAction, lookupUser, revokeCompAction } from "./support-actions"

const viewer = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.c" }
const uid = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.order.length = 0
  mocks.requireAdmin.mockResolvedValue(viewer)
  mocks.logAdminAction.mockImplementation(async () => {
    mocks.order.push("audit")
    return 1
  })
  mocks.findUserByEmail.mockImplementation(async () => {
    mocks.order.push("db")
    return null
  })
  mocks.grantComp.mockImplementation(async () => {
    mocks.order.push("db")
  })
  mocks.revokeComp.mockImplementation(async () => {
    mocks.order.push("db")
    return true
  })
})

function expectNoCalls() {
  expect(mocks.logAdminAction).not.toHaveBeenCalled()
  expect(mocks.findUserByEmail).not.toHaveBeenCalled()
  expect(mocks.grantComp).not.toHaveBeenCalled()
  expect(mocks.revokeComp).not.toHaveBeenCalled()
}

describe("non-admins", () => {
  it("never reach the audit or the database", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"))
    await expect(lookupUser("a@b.co")).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(grantCompAction({ userId: uid, expiresAt: null, note: null })).rejects.toThrow()
    await expect(revokeCompAction(uid)).rejects.toThrow()
    expectNoCalls()
  })
})

describe("validation", () => {
  it("rejects bad input without any call", async () => {
    expect(await lookupUser("nobody")).toHaveProperty("error")
    expect(await lookupUser("a".repeat(196) + "@b.co")).toEqual({ error: "That email is too long." })
    expect(await lookupUser("nobody")).toEqual({ error: "Enter the full email address." })
    expect(await grantCompAction({ userId: "nope", expiresAt: null, note: null })).toHaveProperty("error")
    expect(await grantCompAction({ userId: uid, expiresAt: "2030-02-31", note: null })).toHaveProperty("error")
    expect(await grantCompAction({ userId: uid, expiresAt: "tomorrow", note: null })).toHaveProperty("error")
    expect(await grantCompAction({ userId: uid, expiresAt: null, note: "x".repeat(201) })).toHaveProperty("error")
    expect(await revokeCompAction("nope")).toHaveProperty("error")
    expectNoCalls()
  })
})

describe("audit first, fail closed", () => {
  it("audits before the database", async () => {
    await lookupUser("  Person@Example.com ")
    await grantCompAction({ userId: uid, expiresAt: null, note: null })
    await revokeCompAction(uid)
    expect(mocks.order).toEqual(["audit", "db", "audit", "db", "audit", "db"])
    expect(mocks.logAdminAction).toHaveBeenCalledWith(viewer, "user.lookup", "person@example.com")
    expect(mocks.logAdminAction).toHaveBeenCalledWith(viewer, "comp.revoke", uid)
    expect(mocks.findUserByEmail).toHaveBeenCalledWith("person@example.com")
  })

  it("makes no database call when the audit fails", async () => {
    mocks.logAdminAction.mockRejectedValue(new Error("down"))
    expect(await lookupUser("a@b.co")).toHaveProperty("error")
    expect(await grantCompAction({ userId: uid, expiresAt: null, note: null })).toHaveProperty("error")
    expect(await revokeCompAction(uid)).toHaveProperty("error")
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
    expect(mocks.grantComp).not.toHaveBeenCalled()
    expect(mocks.revokeComp).not.toHaveBeenCalled()
  })
})

describe("grantCompAction", () => {
  it("converts the date to the end of that day, UTC, and refreshes", async () => {
    expect(await grantCompAction({ userId: uid, expiresAt: "2030-05-01", note: " thanks " })).toEqual({ ok: true })
    expect(mocks.grantComp).toHaveBeenCalledWith(uid, "2030-05-01T23:59:59.999Z", "thanks")
    expect(mocks.logAdminAction).toHaveBeenCalledWith(viewer, "comp.grant", uid, {
      expiresAt: "2030-05-01T23:59:59.999Z",
      note: "thanks",
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/support")
  })

  it("passes null for no end date", async () => {
    await grantCompAction({ userId: uid, expiresAt: null, note: "" })
    expect(mocks.grantComp).toHaveBeenCalledWith(uid, null, null)
  })
})

describe("errors", () => {
  it("passes a known RPC message through", async () => {
    mocks.grantComp.mockRejectedValue(new Error("The end date has to be in the future."))
    expect(await grantCompAction({ userId: uid, expiresAt: "2020-01-01", note: null })).toEqual({
      error: "The end date has to be in the future.",
    })
  })

  it("hides anything else", async () => {
    mocks.revokeComp.mockRejectedValue(new Error('relation "secret" does not exist'))
    expect(await revokeCompAction(uid)).toEqual({ error: "Something went wrong." })
    mocks.findUserByEmail.mockRejectedValue(new Error("boom"))
    expect(await lookupUser("a@b.co")).toEqual({ error: "Something went wrong." })
  })
})
