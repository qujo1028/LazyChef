/** Spoonacular's terms ask for a visible credit wherever their data shows. */
export function SpoonacularCredit({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      {children}
      {children ? <br /> : null}
      Powered by{" "}
      <a
        href="https://spoonacular.com/food-api"
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-6 items-center underline underline-offset-2"
      >
        Spoonacular
      </a>
    </p>
  )
}
