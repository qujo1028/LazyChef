export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or with email
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
