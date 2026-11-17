// Who runs LazyChef and how to reach them: shown on the privacy, terms and support pages.

export const OPERATOR_NAME = "Quinn Johnson"

/** Set NEXT_PUBLIC_SUPPORT_EMAIL once the support address exists; until then the pages say so. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null

/** When the privacy policy and terms last changed. Update it with any change to them. */
export const LEGAL_UPDATED = "November 9, 2026"
