"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserCard } from "@/features/admin/components/user-card"
import { lookupUser } from "@/features/admin/support-actions"
import type { SupportUser } from "@/features/admin/support-db"
import { actionError, callAction } from "@/lib/call-action"

type Found = { user: SupportUser | null }

/**
 * Finds one account by exact email. The email and the result live only in this component's
 * state: nothing goes in the URL, so it can't end up in history, logs or a shared link.
 */
export function UserLookup() {
  const [email, setEmail] = useState("")
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = email.trim()
    if (!value || pending) return
    setError(null)
    startTransition(async () => {
      const result = await callAction(() => lookupUser(value))
      const message = actionError(result)
      if (message) {
        setFound(null)
        setError(message)
        toast.error(message)
        return
      }
      if ("user" in result) setFound({ user: result.user })
    })
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Looks up one account by its exact email. Every lookup is recorded in the audit log.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="support-email">Email address</Label>
          <Input
            id="support-email"
            type="email"
            autoComplete="off"
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "support-email-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? "Looking up…" : "Look up"}
        </Button>
      </form>
      {error ? (
        <p id="support-email-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {found ? (
        found.user ? (
          <UserCard
            // A new lookup resets the form inside the card.
            key={found.user.userId}
            user={found.user}
            onChange={(user) => setFound({ user })}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No account uses that email.</p>
        )
      ) : null}
    </div>
  )
}
