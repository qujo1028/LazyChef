import type { PhotoCredit } from "@lazychef/core/recipes/photo-credit"

/** "Photo: Jane Doe, CC BY-SA 4.0" under a library photo (the license requires it), or "AI-generated image". */
export function PhotoCreditLine({ credit }: { credit: PhotoCredit }) {
  if (credit.kind === "ai") {
    return <figcaption className="text-xs text-muted-foreground">{credit.text}</figcaption>
  }
  return (
    <figcaption className="text-xs break-words text-muted-foreground">
      {credit.href ? (
        <a href={credit.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {credit.text}
        </a>
      ) : (
        credit.text
      )}
      {credit.licenseHref ? (
        <>
          {" "}
          <a href={credit.licenseHref} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            (license)
          </a>
        </>
      ) : null}
    </figcaption>
  )
}
