"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { z } from "zod"

import { type IssueColumn, labelsForMove } from "@/features/admin/board"
import { GITHUB_CACHE_TAG, GitHubError } from "@/features/admin/github"
import {
  ensureStatusLabels,
  getIssue,
  setIssueLabels,
  setIssueState,
} from "@/features/admin/github-issues"
import { requireAdmin } from "@/features/admin/guard"

export type BoardActionResult = { ok: true } | { error: string }

const numberSchema = z.number().int().positive()
const columnSchema = z.enum(["backlog", "next", "in-progress"])

const BAD_INPUT: BoardActionResult = { error: "That issue number or column isn't valid." }

function refreshBoard() {
  // expire: 0 so the next render reads fresh GitHub data, not a copy up to 60 s old.
  revalidateTag(GITHUB_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/board")
}

function failure(error: unknown): BoardActionResult {
  if (error instanceof GitHubError) return { error: error.message }
  console.error("[admin] board action failed:", error)
  return { error: "Something went wrong talking to GitHub." }
}

/** Moves an open issue to Backlog, Up next or In progress by swapping its status label. A closed issue is reopened. */
export async function moveIssue(number: number, column: IssueColumn): Promise<BoardActionResult> {
  await requireAdmin()
  const n = numberSchema.safeParse(number)
  const target = columnSchema.safeParse(column)
  if (!n.success || !target.success) return BAD_INPUT

  try {
    const issue = await getIssue(n.data)
    if (issue.isPull) return { error: "That's a pull request, not an issue." }
    if (target.data !== "backlog") await ensureStatusLabels()
    await setIssueLabels(n.data, labelsForMove(issue.labels, target.data))
    if (issue.state === "closed") await setIssueState(n.data, "open", "reopened")
    refreshBoard()
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function closeIssue(number: number): Promise<BoardActionResult> {
  await requireAdmin()
  const n = numberSchema.safeParse(number)
  if (!n.success) return BAD_INPUT

  try {
    await setIssueState(n.data, "closed", "completed")
    refreshBoard()
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function reopenIssue(number: number): Promise<BoardActionResult> {
  await requireAdmin()
  const n = numberSchema.safeParse(number)
  if (!n.success) return BAD_INPUT

  try {
    await setIssueState(n.data, "open", "reopened")
    refreshBoard()
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
