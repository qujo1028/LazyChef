/** TheMealDB's terms: say where the data comes from and link back. */
export function TheMealDbCredit({ href = "https://www.themealdb.com" }: { href?: string }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Recipe data from{" "}
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center underline underline-offset-2">
        TheMealDB
      </a>
    </p>
  )
}
