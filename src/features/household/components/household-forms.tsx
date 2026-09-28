"use client"

import { useActionState, useEffect, useState } from "react"
import { toast } from "sonner"

import { FormMessage } from "@/components/form-message"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  createHousehold,
  joinHousehold,
  renameHousehold,
  updateDisplayName,
  type ActionState,
} from "@/features/household/actions"
import { formatInviteCode, normalizeInviteCode } from "@/lib/invite"

export function CreateHouseholdForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createHousehold, undefined)
  return (
    <form action={action} className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="household-name">Household name</FieldLabel>
        <Input id="household-name" name="name" placeholder="e.g. Maple St apartment" maxLength={60} required />
      </Field>
      <FormMessage error={state?.error} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Create household"}
      </Button>
    </form>
  )
}

export function JoinHouseholdForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinHousehold, undefined)
  const [code, setCode] = useState(defaultCode ? formatInviteCode(normalizeInviteCode(defaultCode)) : "")

  function handleChange(value: string) {
    const clean = normalizeInviteCode(value).slice(0, 8)
    setCode(clean.length > 4 ? formatInviteCode(clean) : clean)
  }

  return (
    <form action={action} className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="invite-code">Invite code</FieldLabel>
        <Input
          id="invite-code"
          name="code"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="K7QX-M2PA"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
          required
        />
        <FieldDescription>Ask a housemate for the code, or just open their invite link.</FieldDescription>
      </Field>
      <FormMessage error={state?.error} />
      <Button type="submit" size="lg" variant="secondary" disabled={pending}>
        {pending ? "Joining…" : "Join household"}
      </Button>
    </form>
  )
}

function useSavedToast(state: ActionState, message: string) {
  useEffect(() => {
    if (state?.saved) toast.success(message)
  }, [state, message])
}

export function RenameHouseholdForm({ householdId, name }: { householdId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renameHousehold, undefined)
  useSavedToast(state, "Household renamed")
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="householdId" value={householdId} />
      <Field>
        <FieldLabel htmlFor="rename-household">Household name</FieldLabel>
        <div className="flex gap-2">
          <Input id="rename-household" name="name" defaultValue={name} maxLength={60} required />
          <Button type="submit" variant="secondary" disabled={pending} className="h-11">
            Save
          </Button>
        </div>
      </Field>
      <FormMessage error={state?.error} />
    </form>
  )
}

export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateDisplayName, undefined)
  useSavedToast(state, "Name updated")
  return (
    <form action={action} className="grid gap-3">
      <Field>
        <FieldLabel htmlFor="display-name">Your name</FieldLabel>
        <div className="flex gap-2">
          <Input id="display-name" name="displayName" defaultValue={displayName} maxLength={60} required />
          <Button type="submit" variant="secondary" disabled={pending} className="h-11">
            Save
          </Button>
        </div>
      </Field>
      <FormMessage error={state?.error} />
    </form>
  )
}
