import { CircleAlert, MailCheck } from "lucide-react"

/** Inline result of a form submit: an error, or a notice like "check your email". */
export function FormMessage({ error, notice }: { error?: string; notice?: string }) {
  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {error}
      </p>
    )
  }
  if (notice) {
    return (
      <p role="status" className="flex gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-foreground">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {notice}
      </p>
    )
  }
  return null
}
