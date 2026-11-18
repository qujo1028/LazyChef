import "server-only"

import { z } from "zod"

import { gh } from "@/features/admin/github"

export type AlertIssue = { number: number; title: string; url: string; createdAt: string }

const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  created_at: z.string(),
  pull_request: z.unknown().optional(),
})

/** Keeps well-formed issues, drops pull requests and anything unreadable. */
export function parseAlertIssues(data: unknown): AlertIssue[] {
  if (!Array.isArray(data)) return []
  const out: AlertIssue[] = []
  for (const item of data) {
    const parsed = issueSchema.safeParse(item)
    if (!parsed.success || parsed.data.pull_request !== undefined) continue
    const { number, title, html_url, created_at } = parsed.data
    out.push({ number, title, url: html_url, createdAt: created_at })
  }
  return out
}

/** Open GitHub issues labelled "alert". Empty on any problem (no config, rate limit, bad data). */
export async function listAlertIssues(): Promise<AlertIssue[]> {
  try {
    return parseAlertIssues(await gh<unknown[]>("/issues?state=open&labels=alert&per_page=10"))
  } catch {
    return []
  }
}
