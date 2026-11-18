import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { ensureStatusLabels, listOpenIssues, listOpenPulls, listRecentlyClosedIssues, setIssueLabels, setIssueState } from "./github-issues"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function issue(number: number, extra: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    html_url: `https://github.com/acme/app/issues/${number}`,
    state: "open",
    labels: [{ name: "bug" }],
    assignee: null,
    created_at: "2026-11-01T00:00:00Z",
    closed_at: null,
    ...extra,
  }
}

beforeEach(() => {
  vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "t0k")
  vi.stubEnv("GITHUB_REPO", "acme/app")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("listOpenIssues", () => {
  it("drops pull requests and maps fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json([issue(1, { assignee: { login: "q", avatar_url: "http://a/q.png" } }), issue(2, { pull_request: { url: "x" } })]),
      )
    vi.stubGlobal("fetch", fetchMock)
    const result = await listOpenIssues()
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/acme/app/issues?state=open&per_page=100")
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ number: 1, labels: ["bug"], assignee: { login: "q", avatarUrl: "http://a/q.png" } })
  })

  it("throws when the payload isn't what we expect", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "nope" })))
    await expect(listOpenIssues()).rejects.toMatchObject({ code: "http" })
  })
})

describe("listRecentlyClosedIssues", () => {
  it("keeps only issues closed inside the window, newest first", async () => {
    const now = Date.parse("2026-11-17T00:00:00Z")
    const fetchMock = vi.fn().mockResolvedValue(
      json([
        issue(1, { state: "closed", closed_at: "2026-11-12T00:00:00Z" }),
        issue(2, { state: "closed", closed_at: "2026-11-01T00:00:00Z" }),
        issue(3, { state: "closed", closed_at: "2026-11-15T00:00:00Z" }),
        issue(4, { state: "closed", closed_at: "2026-11-15T00:00:00Z", pull_request: {} }),
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await listRecentlyClosedIssues(7, now)
    expect(result.map((i) => i.number)).toEqual([3, 1])
    expect(fetchMock.mock.calls[0][0]).toContain("since=2026-11-10T00%3A00%3A00.000Z")
  })
})

describe("listOpenPulls", () => {
  it("adds review state, CI and linked issues", async () => {
    const pull = {
      number: 7,
      title: "Do it",
      html_url: "https://github.com/acme/app/pull/7",
      draft: true,
      body: "Fixes #3",
      created_at: "2026-11-10T00:00:00Z",
      user: { login: "q" },
      head: { sha: "abc" },
    }
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/reviews")) return json([{ user: { login: "r" }, state: "APPROVED" }])
      if (url.includes("/status")) return json({ state: "success" })
      return json([pull])
    })
    vi.stubGlobal("fetch", fetchMock)
    const [result] = await listOpenPulls()
    expect(result).toMatchObject({ number: 7, draft: true, author: "q", reviewState: "approved", ci: "success", linkedIssues: [3] })
  })

  it("still lists the PR when the detail calls fail", async () => {
    const pull = { number: 7, title: "x", html_url: "u", created_at: "2026-11-10T00:00:00Z", head: { sha: "abc" } }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("/pulls?") ? json([pull]) : json({}, 500))),
    )
    const [result] = await listOpenPulls()
    expect(result).toMatchObject({ number: 7, reviewState: null, ci: null })
  })
})

describe("writes", () => {
  it("PUTs labels and PATCHes state", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      void url
      void init
      return json({})
    })
    vi.stubGlobal("fetch", fetchMock)
    await setIssueLabels(5, ["a"])
    await setIssueState(5, "closed", "completed")
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/acme/app/issues/5/labels")
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ labels: ["a"] }) })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) })
  })

  it("ensureStatusLabels tolerates labels that already exist", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 422)).mockResolvedValueOnce(json({}, 201))
    vi.stubGlobal("fetch", fetchMock)
    await expect(ensureStatusLabels()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("ensureStatusLabels surfaces other failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 403)))
    await expect(ensureStatusLabels()).rejects.toMatchObject({ code: "bad_token" })
  })
})
