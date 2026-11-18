"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { grantCompAction, revokeCompAction } from "@/features/admin/support-actions"
import type { SupportUser } from "@/features/admin/support-db"
import { actionError, callAction } from "@/lib/call-action"

const NOTE_MAX = 200

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** "2030-05-01" as "May 1, 2030" (a date-only string, so no time zone shifts it). */
function dayLabel(value: string): string {
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })
}

/** Give, change or remove a person's free Pro. Each change asks first and is audited on the server. */
export function CompForm({ user, onChange }: { user: SupportUser; onChange: (user: SupportUser) => void }) {
  const hasComp = user.proSource === "comp" || user.compExpiresAt !== null
  const [endDate, setEndDate] = useState(user.compExpiresAt ? user.compExpiresAt.slice(0, 10) : "")
  const [note, setNote] = useState(user.compNote ?? "")
  const [grantOpen, setGrantOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const name = user.displayName || user.email
  const dateValid = endDate === "" || endDate >= todayUtc()

  function grant() {
    startTransition(async () => {
      const result = await callAction(() =>
        grantCompAction({ userId: user.userId, expiresAt: endDate || null, note: note.trim() || null }),
      )
      const message = actionError(result)
      setGrantOpen(false)
      if (message) {
        toast.error(message)
        return
      }
      toast.success(`${name} has free Pro.`)
      // Update what's on screen instead of looking the person up again (which would be logged again).
      onChange({
        ...user,
        proSource: user.proSource === "subscription" ? "subscription" : "comp",
        compExpiresAt: endDate ? `${endDate}T23:59:59.999Z` : null,
        compNote: note.trim() || null,
      })
    })
  }

  function revoke() {
    startTransition(async () => {
      const result = await callAction(() => revokeCompAction(user.userId))
      const message = actionError(result)
      setRevokeOpen(false)
      if (message) {
        toast.error(message)
        return
      }
      toast.success(`Free Pro removed from ${name}.`)
      onChange({
        ...user,
        proSource: user.proSource === "comp" ? null : user.proSource,
        compExpiresAt: null,
        compNote: null,
      })
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <h4 className="text-sm font-medium">Pro comp</h4>
      <div className="grid gap-1.5">
        <Label htmlFor="comp-end">Ends on (leave empty for no end date)</Label>
        <Input
          id="comp-end"
          type="date"
          min={todayUtc()}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-invalid={dateValid ? undefined : true}
          className="sm:max-w-48"
        />
        {dateValid ? null : (
          <p role="alert" className="text-sm text-destructive">
            The end date has to be today or later.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="comp-note">Note (why they have it)</Label>
        <Input
          id="comp-note"
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="comp-note-count"
        />
        <p id="comp-note-count" className="text-xs text-muted-foreground">
          {note.length} / {NOTE_MAX}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <AlertDialog open={grantOpen} onOpenChange={setGrantOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={pending || !dateValid}>
              {hasComp ? "Update free Pro" : "Give free Pro"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Give {name} free Pro {endDate ? `until ${dayLabel(endDate)}` : "with no end date"}?
              </AlertDialogTitle>
              <AlertDialogDescription>This is recorded in the audit log.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault()
                  grant()
                }}
              >
                {pending ? "Saving…" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {hasComp ? (
          <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={pending}>
                Remove free Pro
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove free Pro from {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They keep any Pro they get from their own subscription or household. This is recorded in the audit
                  log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault()
                    revoke()
                  }}
                >
                  {pending ? "Removing…" : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  )
}
