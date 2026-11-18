/** Which env vars are set. Shows names and Set/Missing only; values are never passed in. */
export function EnvChecklist({ items }: { items: { name: string; set: boolean; required: boolean }[] }) {
  return (
    <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {items.map((item) => {
        const missingRequired = !item.set && item.required
        return (
          <li key={item.name} className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="min-w-0 font-mono text-xs break-all">{item.name}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {item.required ? <span className="text-xs text-muted-foreground">required</span> : null}
              <span
                className={
                  missingRequired ? "font-medium text-destructive" : item.set ? undefined : "text-muted-foreground"
                }
              >
                {item.set ? "Set" : "Missing"}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
