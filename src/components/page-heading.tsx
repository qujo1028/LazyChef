export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
