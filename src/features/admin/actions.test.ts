import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  getIssue: vi.fn(),
  setIssueLabels: vi.fn(),
  setIssueState: vi.fn(),
  ensureStatusLabels: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock("@/features/admin/audit", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/features/admin/guard", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag, revalidatePath: mocks.revalidatePath }))
vi.mock("@/features/admin/github-issues", () => ({
  getIssue: mocks.getIssue,
  setIssueLabels: mocks.setIssueLabels,
  setIssueState: mocks.setIssueState,
  ensureStatusLabels: mocks.ensureStatusLabels,
}))

import { GitHubError } from "./github"
import { closeIssue, moveIssue, reopenIssue } from "./actions"

const openIssue = { number: 4, labels: ["bug", "status: next"], state: "open", isPull: false }

const viewer = { id: "u1", email: "a@b.c" }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireAdmin.mockResolvedValue(viewer)
  mocks.logAdminAction.mockResolvedValue(1)
})

describe("non-admins", () => {
  it("never reach GitHub", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"))
    await expect(moveIssue(4, "next")).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(closeIssue(4)).rejects.toThrow()
    await expect(reopenIssue(4)).rejects.toThrow()
    expect(mocks.getIssue).not.toHaveBeenCalled()
    expect(mocks.setIssueLabels).not.toHaveBeenCalled()
    expect(mocks.setIssueState).not.toHaveBeenCalled()
  })
})

describe("validation", () => {
  it("rejects bad numbers and columns", async () => {
    expect(await moveIssue(0, "next")).toHaveProperty("error")
    expect(await moveIssue(1.5, "next")).toHaveProperty("error")
    // @ts-expect-error not an issue column
    expect(await moveIssue(4, "done")).toHaveProperty("error")
    expect(await closeIssue(-1)).toHaveProperty("error")
    expect(await reopenIssue(Number.NaN)).toHaveProperty("error")
    expect(mocks.setIssueLabels).not.toHaveBeenCalled()
    expect(mocks.setIssueState).not.toHaveBeenCalled()
  })
})

describe("moveIssue", () => {
  it("swaps the status label and refreshes", async () => {
    mocks.getIssue.mockResolvedValue(openIssue)
    expect(await moveIssue(4, "in-progress")).toEqual({ ok: true })
    expect(mocks.ensureStatusLabels).toHaveBeenCalled()
    expect(mocks.setIssueLabels).toHaveBeenCalledWith(4, ["bug", "status: in-progress"])
    expect(mocks.setIssueState).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-github", { expire: 0 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/board")
  })

  it("moving to backlog drops status labels without creating any", async () => {
    mocks.getIssue.mockResolvedValue(openIssue)
    await moveIssue(4, "backlog")
    expect(mocks.ensureStatusLabels).not.toHaveBeenCalled()
    expect(mocks.setIssueLabels).toHaveBeenCalledWith(4, ["bug"])
  })

  it("reopens a closed issue it moves", async () => {
    mocks.getIssue.mockResolvedValue({ ...openIssue, state: "closed" })
    await moveIssue(4, "next")
    expect(mocks.setIssueState).toHaveBeenCalledWith(4, "open", "reopened")
  })

  it("refuses pull requests", async () => {
    mocks.getIssue.mockResolvedValue({ ...openIssue, isPull: true })
    expect(await moveIssue(4, "next")).toHaveProperty("error")
    expect(mocks.setIssueLabels).not.toHaveBeenCalled()
  })

  it("returns the GitHubError message, not the raw error", async () => {
    mocks.getIssue.mockRejectedValue(new GitHubError("rate_limited"))
    expect(await moveIssue(4, "next")).toEqual({ error: new GitHubError("rate_limited").message })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("hides unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.getIssue.mockRejectedValue(new Error("secret internals"))
    const result = await moveIssue(4, "next")
    expect(JSON.stringify(result)).not.toContain("secret")
  })
})

describe("closeIssue / reopenIssue", () => {
  it("close sets closed/completed", async () => {
    expect(await closeIssue(4)).toEqual({ ok: true })
    expect(mocks.setIssueState).toHaveBeenCalledWith(4, "closed", "completed")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/board")
  })

  it("reopen sets open/reopened", async () => {
    expect(await reopenIssue(4)).toEqual({ ok: true })
    expect(mocks.setIssueState).toHaveBeenCalledWith(4, "open", "reopened")
  })
})

describe("audit log", () => {
  it("records each action before touching GitHub", async () => {
    mocks.getIssue.mockResolvedValue(openIssue)
    await moveIssue(4, "next")
    await closeIssue(5)
    await reopenIssue(6)
    expect(mocks.logAdminAction).toHaveBeenNthCalledWith(1, viewer, "issue.move", "#4", { column: "next" })
    expect(mocks.logAdminAction).toHaveBeenNthCalledWith(2, viewer, "issue.close", "#5", undefined)
    expect(mocks.logAdminAction).toHaveBeenNthCalledWith(3, viewer, "issue.reopen", "#6", undefined)
  })

  it("does not audit invalid input", async () => {
    await moveIssue(0, "next")
    await closeIssue(-1)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("stops before GitHub when the audit fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.logAdminAction.mockRejectedValue(new Error("db down"))
    const expected = { error: "Couldn't record this in the audit log, so nothing was changed." }
    expect(await moveIssue(4, "next")).toEqual(expected)
    expect(await closeIssue(4)).toEqual(expected)
    expect(await reopenIssue(4)).toEqual(expected)
    expect(mocks.getIssue).not.toHaveBeenCalled()
    expect(mocks.setIssueLabels).not.toHaveBeenCalled()
    expect(mocks.setIssueState).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
