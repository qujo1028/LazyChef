import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { listAlertIssues, parseAlertIssues } from "./alert-issues"

const raw = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `Alert ${n}`,
  html_url: `https://github.com/acme/app/issues/${n}`,
  created_at: "2026-11-01T00:00:00Z",
  ...extra,
})

describe("parseAlertIssues", () => {
  it("maps issues and drops pull requests and malformed items", () => {
    const out = parseAlertIssues([raw(1), raw(2, { pull_request: {} }), { number: "x" }, null])
    expect(out).toEqual([
      { number: 1, title: "Alert 1", url: "https://github.com/acme/app/issues/1", createdAt: "2026-11-01T00:00:00Z" },
    ])
  })
  it("returns nothing for non-arrays", () => {
    expect(parseAlertIssues({ message: "nope" })).toEqual([])
  })
})

describe("listAlertIssues", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "t0k")
    vi.stubEnv("GITHUB_REPO", "acme/app")
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  it("fetches open alert issues", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify([raw(7)]), { status: url ? 200 : 500 }))
    vi.stubGlobal("fetch", fetchMock)
    const out = await listAlertIssues()
    expect(out).toHaveLength(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("labels=alert")
    expect(url).toContain("state=open")
  })
  it("returns nothing when GitHub errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
    expect(await listAlertIssues()).toEqual([])
  })
  it("returns nothing when there is no config", async () => {
    vi.stubEnv("GITHUB_DASHBOARD_TOKEN", "")
    vi.stubEnv("GITHUB_REPO", "")
    expect(await listAlertIssues()).toEqual([])
  })
})
