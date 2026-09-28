"use client"

import { useTransition } from "react"
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

/**
 * A trigger that asks before running a server action. The action may return
 * { error } to show a toast, or redirect.
 */
export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  successMessage,
  destructive = false,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => Promise<{ error?: string } | undefined | void>
  successMessage?: string
  destructive?: boolean
}) {
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      const result = await onConfirm()
      if (result && "error" in result && result.error) toast.error(result.error)
      else if (successMessage) toast.success(successMessage)
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={run}
            disabled={pending}
            variant={destructive ? "destructive" : "default"}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
